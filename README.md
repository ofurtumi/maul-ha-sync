# maul-ha-sync

Syncs weekly lunch orders from [maul.is](https://maul.is) into Home Assistant sensors.

## How it works

1. Authenticates to AWS Cognito (SRP flow) using your Maul email + password
2. Calls `api.maul.is/foodie/users/{id}/orders/{ISO_WEEK}/v2`
3. Pushes each day's lunch as a HA sensor via the Supervisor API
4. Runs on a cron schedule (default: Monday 07:00) and once on startup

## Sensors created

- `sensor.maul_lunch_monday` … `sensor.maul_lunch_friday` — one per day, state is the English description
- `sensor.maul_lunch_today` — state is `synced`, attributes contain the full week's `meals` map + `iso_week`

Each per-day sensor has attributes: `restaurant`, `description_is`, `allergens`, `iso_week`.

## HA add-on install

### 1. Add this repository to HA

In HA: **Settings → Add-ons → Add-on store** → overflow menu (⋮) → **Repositories** → paste:

```
https://github.com/ofurtumi/maul-ha-sync
```

Click **Add**, close the dialog, then find **Maul Lunch Sync** in the store and click **Install**.  
HA pulls the repo and builds the Docker image itself — no copying files by hand.

### 2. Configure credentials

Go to the add-on's **Configuration** tab and fill in:

```yaml
maul_email: you@example.com
maul_password: yourpassword
sync_cron: "0 7 * * 1"   # Monday 07:00 — change if needed
```

### 3. Start the add-on

Hit **Start**. It syncs immediately on first boot, then repeats on the cron schedule.  
Check the **Log** tab to confirm it ran successfully.

## Releasing an update

HA only offers an update when the `version` in `addon/config.yaml` goes up.

1. Make your changes in `addon/`, bump `version` in `addon/config.yaml`, commit and push to `main`
2. In HA: **Add-on store** → ⋮ → **Check for updates** (or wait for HA to notice on its own)
3. Maul Lunch Sync shows an **Update** button — click it; HA rebuilds the image and restarts the add-on

> Pushing without bumping `version` does nothing on the HA side.

## Using the sensor in automations

```yaml
- service: tts.speak
  data:
    message: >
      Today's lunch from Maul is:
      {{ states('sensor.maul_lunch_' + now().strftime('%A').lower()) }}
```

Or to read today's meal with allergens:

```yaml
{% set day = now().strftime('%A').lower() %}
{% set meal = state_attr('sensor.maul_lunch_today', 'meals')[now().strftime('%A')] %}
Today: {{ meal.description_en }}. Allergens: {{ meal.allergens | join(', ') }}.
```

## Local dev / testing

```bash
cd /Users/tumi/Misc/maul-ha-sync
npm install
npm run sync   # reads .env for credentials, writes maul_orders.json locally
```
