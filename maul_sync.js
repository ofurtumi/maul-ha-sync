#!/usr/bin/env node
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const POOL_ID = "eu-west-1_KkkgJsbfo";
const CLIENT_ID = "2qavs2k3odmgef85si7bv02qjb";
const API_BASE = "https://api.maul.is/foodie";

const EMAIL = process.env.MAUL_EMAIL;
const PASSWORD = process.env.MAUL_PASSWORD;

console.info("Starting Maul order sync...");
console.info(
  `Maul user: ${EMAIL}\nMaul password: ${PASSWORD ? "********" : "(not set)"}`,
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "maul_orders.json");

function getIsoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function authenticate() {
  return new Promise((resolve, reject) => {
    const pool = new CognitoUserPool({
      UserPoolId: POOL_ID,
      ClientId: CLIENT_ID,
    });
    const user = new CognitoUser({ Username: EMAIL, Pool: pool });
    const auth = new AuthenticationDetails({
      Username: EMAIL,
      Password: PASSWORD,
    });

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
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

const DAY_ABBREV = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function ordersByDay(orders) {
  const result = {};
  for (const order of orders) {
    const parts = (order.MenuItemId ?? "").split(".");
    const day = DAY_ABBREV[parts.at(-1)] ?? parts.at(-1);
    result[day] = {
      restaurant: order.RestaurantId ?? "",
      meal_time: order.MealTime ?? "",
      description_en: order.DescriptionByLang?.en ?? "",
      description_is: order.DescriptionByLang?.is ?? "",
      allergens: order.Allergens ?? [],
    };
  }
  return result;
}

if (!EMAIL || !PASSWORD) {
  console.error("Set MAUL_EMAIL and MAUL_PASSWORD environment variables.");
  process.exit(1);
}

const isoWeek = getIsoWeek();
console.log(`Authenticating as ${EMAIL}...`);
const { accessToken, userId } = await authenticate();

console.log(`Fetching orders for ${isoWeek}...`);
const raw = await fetchOrders(accessToken, userId, isoWeek);
const meals = ordersByDay(raw);

const output = {
  iso_week: isoWeek,
  synced_at: new Date().toISOString().slice(0, 10),
  meals,
};

writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
console.log(`Wrote ${Object.keys(meals).length} orders to ${OUTPUT}`);
