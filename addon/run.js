import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";
import cron from "node-cron";
import { readFileSync } from "fs";

const POOL_ID = "eu-west-1_KkkgJsbfo";
const CLIENT_ID = "2qavs2k3odmgef85si7bv02qjb";
const API_BASE = "https://api.maul.is/foodie";
const HA_API = "http://supervisor/core/api";

const options = JSON.parse(readFileSync("/data/options.json", "utf8"));
const { maul_email: EMAIL, maul_password: PASSWORD, sync_cron: CRON } = options;
const HA_TOKEN = process.env.SUPERVISOR_TOKEN;

function getIsoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function authenticate() {
  return new Promise((resolve, reject) => {
    const pool = new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID });
    const user = new CognitoUser({ Username: EMAIL, Pool: pool });
    const auth = new AuthenticationDetails({ Username: EMAIL, Password: PASSWORD });
    user.authenticateUser(auth, {
      onSuccess(session) {
        resolve({
          accessToken: session.getAccessToken().getJwtToken(),
          userId: session.getAccessToken().payload.sub,
        });
      },
      onFailure: reject,
    });
  });
}

async function fetchOrders(accessToken, userId, isoWeek) {
  const res = await fetch(`${API_BASE}/users/${userId}/orders/${isoWeek}/v2`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Maul API error ${res.status}: ${await res.text()}`);
  return res.json();
}

const DAY_ABBREV = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function ordersByDay(orders) {
  const result = {};
  for (const order of orders) {
    const parts = (order.MenuItemId ?? "").split(".");
    const day = DAY_ABBREV[parts.at(-1)] ?? parts.at(-1);
    result[day] = {
      restaurant: order.RestaurantId ?? "",
      description_en: order.DescriptionByLang?.en ?? "",
      description_is: order.DescriptionByLang?.is ?? "",
      allergens: order.Allergens ?? [],
    };
  }
  return result;
}

async function pushToHA(meals, isoWeek) {
  if (!HA_TOKEN) {
    console.error("SUPERVISOR_TOKEN is not set — cannot push to HA API");
    return;
  }
  console.log(`Pushing to HA API at ${HA_API}`);

  const headers = {
    Authorization: `Bearer ${HA_TOKEN}`,
    "Content-Type": "application/json",
  };

  // One sensor per day so HA can simply read today's
  for (const [day, meal] of Object.entries(meals)) {
    const entityId = `sensor.maul_lunch_${day.toLowerCase()}`;
    const res = await fetch(`${HA_API}/states/${entityId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        state: meal.description_en || "No order",
        attributes: {
          friendly_name: `Maul Lunch ${day}`,
          restaurant: meal.restaurant,
          description_is: meal.description_is,
          allergens: meal.allergens,
          iso_week: isoWeek,
        },
      }),
    });
    if (!res.ok) console.error(`Failed to push ${entityId}: ${res.status} ${await res.text()}`);
    else console.log(`  ✓ ${entityId}`);
  }

  // Also update a "today" sensor that HA automations can read directly
  const summaryRes = await fetch(`${HA_API}/states/sensor.maul_lunch_today`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state: "synced",
      attributes: {
        friendly_name: "Maul Lunch This Week",
        iso_week: isoWeek,
        meals,
        synced_at: new Date().toISOString(),
      },
    }),
  });
  if (!summaryRes.ok) console.error(`Failed to push summary sensor: ${summaryRes.status} ${await summaryRes.text()}`);

  console.log(`Pushed ${Object.keys(meals).length} days to HA`);
}

async function sync() {
  try {
    console.log("Syncing Maul orders...");
    const isoWeek = getIsoWeek();
    const { accessToken, userId } = await authenticate();
    const raw = await fetchOrders(accessToken, userId, isoWeek);
    const meals = ordersByDay(raw);
    await pushToHA(meals, isoWeek);
    console.log(`Done — synced week ${isoWeek}`);
  } catch (err) {
    console.error("Sync failed:", err.message);
  }
}

// Run immediately on startup so first boot syncs right away
await sync();

// Then run on the configured cron schedule (default: Monday 07:00)
console.log(`Scheduled with cron: ${CRON}`);
cron.schedule(CRON, sync);
