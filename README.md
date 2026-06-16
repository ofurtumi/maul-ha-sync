# maul-ha-sync

Syncs weekly lunch orders from [maul.is](https://maul.is) into Home Assistant sensors.

## How it works

1. Authenticates to AWS Cognito (SRP flow) using your Maul email + password
2. Calls `dev-api.maul.is/users/{id}/orders/{ISO_WEEK}/v2`
3. Pushes each day's lunch as a HA sensor via the Supervisor API
4. Runs on a cron schedule (default: Monday 07:00) and once on startup

## Sensors created

- `sensor.maul_lunch_monday` … `sensor.maul_lunch_friday` — one per day, state is the English description
- `sensor.maul_lunch_today` — state is `synced`, attributes contain the full week's `meals` map + `iso_week`

Each per-day sensor has attributes: `restaurant`, `description_is`, `allergens`, `iso_week`.

## HA add-on install

### 1. Copy the add-on to your HA instance

Via Samba or SSH, copy the `addon/` folder to `/addons/maul_sync/` on your HA instance:

```
/addons/maul_sync/
  config.yaml
  Dockerfile
  package.json
  run.js
```

### 2. Install from the Local add-ons store

In HA: **Settings → Add-ons → Add-on store** → overflow menu (⋮) → **Check for updates**.  
The add-on will appear under **Local add-ons** as "Maul Lunch Sync". Click Install.

### 3. Configure credentials

Go to the add-on's **Configuration** tab and fill in:

```yaml
maul_email: you@example.com
maul_password: yourpassword
sync_cron: "0 7 * * 1"   # Monday 07:00 — change if needed
```

### 4. Start the add-on

Hit **Start**. It syncs immediately on first boot, then repeats on the cron schedule.  
Check the **Log** tab to confirm it ran successfully.

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
