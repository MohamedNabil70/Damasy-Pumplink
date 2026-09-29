# PumpLink

Arabic, right-to-left, phone-first PWA for the ESP32 pump power controller.
Plain static files: no build step, no backend, no npm. It talks to HiveMQ Cloud directly
from the browser over MQTT on a secure WebSocket:

```
wss://<cluster-id>.s1.eu.hivemq.cloud:8884/mqtt
```

The ESP32 keeps using TLS on 8883. Both listeners run at the same time, and the firmware
is unchanged.

**Nothing secret is in these files.** The cluster address, username and password are typed
in on each phone the first time the app opens, and stored in that phone's `localStorage`.

---

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole app: markup, styles and logic |
| `manifest.json` | PWA manifest: name, icons, `display: standalone`, theme `#181120` |
| `sw.js` | Service worker. Caches the app shell only, never MQTT traffic |
| `icons/` | 192, 512, maskable 512, Apple touch icon |
| `img/` | The ON / OFF / restart artwork from the design |
| `fonts/` | Archivo and Archivo Narrow (Latin, from the design) and Readex Pro (Arabic), self-hosted so the app works offline |

`mqtt.js` 5.16.0 loads from jsDelivr with a pinned version and a Subresource Integrity
hash. The service worker caches it after the first visit.

---

## Publish it as a static site

Any static host works, provided it serves **HTTPS**. Installing to the home screen and the
service worker both require HTTPS.

### GitHub Pages (recommended)

1. Create a new **public** repository on GitHub, for example `pumplink`.
2. Put the *contents* of this folder at the root of that repository, so that `index.html`
   sits at the top level next to `manifest.json` and `sw.js`:
   ```sh
   cd PumpLink
   git init
   git add .
   git commit -m "PumpLink PWA"
   git branch -M main
   git remote add origin https://github.com/<your-user>/pumplink.git
   git push -u origin main
   ```
3. On GitHub, open the repository and go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   **Branch** to `main`, and the folder to `/ (root)`. Click **Save**.
5. Wait about a minute. The site will be at
   `https://<your-user>.github.io/pumplink/`.

All paths in the app are relative, so it works from a sub-path like `/pumplink/`
without any changes.

> If you would rather keep the app inside the existing `water-pump-control` repository,
> note that Pages can only serve from the repository root or from `/docs`. Either rename
> this folder to `docs/` and choose `/docs` in step 4, or keep it in its own repository as
> above. That repository only holds `secrets.h` in `.gitignore`, so check before making
> it public.

### Alternatives

- **Netlify:** go to app.netlify.com → *Add new site* → *Deploy manually*, and drag this
  folder onto the page.
- **Cloudflare Pages:** *Create* → *Pages* → *Upload assets*, then upload this folder.

---

## Install on a phone

1. Open the site URL in **Chrome** on Android.
2. Enter the three connection values:
   - **Server:** the cluster host, for example `abc123def.s1.eu.hivemq.cloud`. No `https://`
     and no port. A full `wss://…` URL is also accepted and used as given.
   - **Username** and **Password:** HiveMQ Cloud credentials.
3. Pick your name, or add it. The first name on an empty roster becomes admin.
4. Open Chrome's **⋮ menu → Install app** (on some phones it says *Add to Home screen*).
   The app then opens full screen with no browser bar.

On iPhone, use Safari: **Share → Add to Home Screen**.

**Tip:** in the HiveMQ Cloud console, create a separate credential for the app instead of
reusing the ESP32's. Give it publish and subscribe permission on `home/pump/#`. You can
then change or revoke the app's password without re-flashing the board.

---

## How it behaves

### What is shown

**حالة الموتور** shows **جاهز** (ready) or **مفصول** (disconnected). At home, "the motor"
means the whole unit: the Flowmac controller plus the pump.

- The contactor sits **upstream of the Flowmac**. The reading comes from the contactor's
  13/14 auxiliary contact, so **جاهز** means mains power is reaching the Flowmac, and it
  will run the pump by itself when needed.
- **جاهز** does **not** mean the pump is running right now; the Flowmac still decides that.
- **مفصول** means the ESP32 has cut power to the Flowmac, so the pump cannot run at all.
- **جاهز is the normal resting state.**

### Colours and the water fill

- **جاهز (ready)** is shown in **light water blue** (`--water: #54d2f0`, icon `img/on-water.png`).
  - This applies to the dial, its ring and glow, and the dot in the *حالة الموتور* row.
  - The rest of the interface keeps the design's lime accent. **مفصول** stays grey glass.
- **Restart:**
  - The icon starts grey and fills with water from the bottom over the firmware's 6 s. The
    water has a moving surface and rising bubbles.
  - The fill stops at **90 %** and waits there, gently breathing, until `home/pump/state`
    confirms power is back.
  - Then it completes to 100 % (ready). If the reading comes back مفصول or never arrives, it
    drains back to grey.
- **ON command:** the same fill, reaching 90 % in under a second and completing on
  confirmation.
- **Where the fill level comes from:** the restart and command timestamps, not a free-running
  timer. So another phone's restart, and an app opened mid-cycle, both show the right thing.
  An app opened mid-cycle starts from empty, because the remaining time is unknown, and jumps
  to full when the confirmation arrives.
- **Reduced motion:** phones with *reduce motion* switched on get no liquid, only a fade to
  the ready state once it is confirmed.

### History and Log

- **History tab (السجل):** only commands that affect the motor: توصيل (`ON`), فصل (`OFF`)
  and إعادة تشغيل (`RESTART`).
  - Each one is taken from the firmware's own `cmd: [...] from <name>` log line, so it
    appears only if the controller actually received it. That includes commands from other
    phones or from a plain MQTT client.
  - Each row shows the result from the firmware's confirmation: اتنفّذ, عطل (MISMATCH),
    اتجاهل (a repeat restart the board refused), or ماتأكدش (no confirmation).
  - `STATUS` checks never appear here.
- **Log window:** everything else. Open it from the **Log** button next to the History
  title.
  - It shows every firmware log line (`FW`), every incoming MQTT message (`RX`, marked
    `[retained]` when it is a replay), everything the app publishes (`TX`, including QoS and
    the retain flag), and the app's own decisions (`APP`), such as STATUS round-trip time,
    stale/offline transitions and unacknowledged commands.
  - **عربي / English** switches the language; the choice is remembered. English shows the
    firmware lines exactly as sent.
  - **Copy** puts the whole log on the clipboard, with a header line: app version, client
    ID, firmware version, date and current freshness. **Clear** empties it.
  - It holds the last 500 lines, in memory only.

### MQTT contract

| Direction | Topic | Detail |
|---|---|---|
| publish | `home/pump/cmd` | `ON:<name>`, `OFF:<name>`, `RESTART:<name>`, `STATUS`. QoS 1, **retain false**. All of these go through one function, `publishCmd()`. |
| publish | `home/pump/users` | Roster JSON, retained, for example `{"محمد":"admin","أحمد":"user"}` |
| subscribe | `state`, `avail`, `hb`, `status`, `log`, `users` | QoS 1 |

### Trusting the display

- **Proof of life** is any *non-retained* message from the controller: `hb`, a `STATUS`
  reply, a `log` line, a live `state` change, or a live `avail: online`. A retained replay
  counts as a reading, not as proof that the board is alive.
- **Stale:** more than **150 s** since the last proof of life, whatever `avail` says.
- **Offline:** `avail` reads `offline` and nothing newer contradicts it. A single `offline`
  is not treated as conclusive. The app waits 5 s, then publishes `STATUS` itself, and
  shows *offline* only if that goes unanswered. The brief `offline → online` flap on a
  fast reconnect therefore never shows as offline.
- **STATUS** is published on every app open, on every reconnect, when the app comes back
  to the foreground, and from the **تأكد من وحدة التحكم** button. No answer within 3 s
  means the controller is not there.

### Commands: no optimistic UI

Pressing a button shows a *pending* state. The display changes only when
`home/pump/state` arrives with the new reading. The firmware publishes it about 1 s after
every command, even when nothing changed.

- **State confirms what was asked:** done.
- **State contradicts it, or a `state after cmd … MISMATCH` log line arrives:** the
  **fault** card appears ("the contactor did not respond"). It stays until the reading
  matches what was commanded.
- **Nothing arrives within 5 s:** a **not acknowledged** card appears, and the display
  keeps the last confirmed reading.

### Restart

`RESTART:<name>` locks both buttons on **every** open copy of the app. Other phones see the
`cmd: [RESTART] from <name>` log line and lock with that name and a 6-second countdown.
When the countdown ends, the lock stays on "waiting for confirmation" until the controller
reports power back ON. The lock is never released by the timer alone. If no confirmation
arrives 5 s after the expected time, the app unlocks and warns.

An app **opened mid-restart** locks from the `STATUS` reply's `restarting: true` (see
*Known limitations*).

A state change that no command explains (no `cmd:` line in the preceding 10 s), such as
power coming back after the ESP32 reboots, shows a dismissible
**"changed without the app"** card.

### Users and roles

Each phone's own name is kept in `localStorage`. The name screen appears once per device,
and later opens go straight to Home with "أهلاً محمد". The roster lives in the retained
`home/pump/users` message. Two people registering in the same second is last-write-wins,
which is accepted.

**Roles are a convention, not security.** Every phone uses the same broker credentials, so
anyone holding them can publish anything. The Family screen says this plainly.

### Client ID

Each client ID is `pumplink-<device>-<tab>`. The device part is random and stored per
phone. The tab part is per browser tab, so the installed app and a browser tab on the same
phone never take over each other's session. Neither part can collide with the board's
`pump-esp32`.

---

## Known limitations

These come from the current firmware, which was deliberately left unchanged:

1. **Who started a restart, and how long is left, is unknown to an app opened mid-cycle.**
   The firmware sets `last_user` on *every* command, including `STATUS`. So the reply to
   the app's own `STATUS` always says `last_user: "unknown"`. The reply also has no
   remaining-time field. The app therefore locks with "جارية · 6 ث أو أقل", which is an
   upper bound with no name, and releases on the confirmed state.
   *Possible firmware fix:* skip the `lastUser` update when the command is `STATUS`, and
   add `restart_left_ms` to the reply.
2. **Opening the app wakes the ESP32's CPU.** `STATUS` counts as activity, so each app
   open resets the one-hour idle timer and brings the CPU back to 240 MHz. It also logs
   `cmd: [STATUS] from unknown`, which appears in the Log but not in History.
3. **History and Log are live only.** They show what arrives while the app is open and are
   lost when the app closes. The firmware's 4 KB ring buffer covers the controller's own network
   outages, not the app's.
4. **No push notifications.** There is no backend, so alerts only appear while the app is
   open. Another person's command shows as a toast.
5. **Credentials are stored in plain text** in the phone's `localStorage`. This is fine
   for a family phone. Use **Settings → امسح بيانات الاتصال** to remove them.
6. **Name length.** A name is limited to 23 bytes, about 11 Arabic letters, and cannot
   contain `"` or `\`. The firmware stores it in `char lastUser[24]` and writes it into the
   STATUS JSON without escaping.

---

## Testing without the hardware

Use the **HiveMQ Cloud web client** (cluster console → *Web Client*). Log in with a
credential that is *not* the app's, and give the web client its own client ID. Open the
app on a phone or laptop at the same time.

### 1. Retained state → power shown

- In the web client, publish **`ON`** to `home/pump/state` with **Retain** ticked.
- **Expect:** the dial shows **جاهز** and the info row *حالة الموتور* reads **جاهز**.
- Publish **`OFF`** the same way. **Expect:** **مفصول**. The **"changed without the app"**
  card also appears, because no command caused the change.
- Then reload the app. **Expect:** it still shows the last retained value. It will also
  briefly say *وحدة التحكم مردّتش*, because nothing answers the `STATUS` it sent on
  open. That is
  correct: a retained reading is not proof that anyone is alive.

### 2. Heartbeat → live, then stale

- Publish a number, for example `120`, to `home/pump/hb` with Retain **off**. Repeat
  every 20–30 s.
- **Expect:** the green pill **متصلة · آخر إشارة من … ث**, and the dial at full opacity.
- Stop publishing and start a timer.
- **Expect:** at **150 s** after the last `hb`, the pill turns amber
  (**قديمة · مفيش إشارة من أكتر من 150 ث**), the dashed **الحالة ممكن تكون قديمة** card
  appears, and the dial dims.
- Publish one more `hb`. **Expect:** it returns to live at once.

### 3. STATUS with `restarting: true` → locked

- Publish this to `home/pump/status` with Retain **off**:
  ```json
  {"ssid":"Damasy","rssi":-58,"ip":"192.168.100.57","uptime_s":3600,"state":"ON","restarting":true,"last_user":"Mohamed","cpu_mhz":240}
  ```
- **Expect:** the dial turns orange, **إعادة تشغيل…**, with **جارية · 6 ث أو أقل** counting
  down. Both buttons are locked, and tapping the dial publishes nothing.
- **Expect when the countdown reaches 0:** it keeps showing
  **مستنيين تأكيد وحدة التحكم…**. The lock is not released by the timer.
- **To release it properly:** publish `ON` to `home/pump/state`. The lock clears
  immediately.
- **If you publish nothing:** about 12 s after the message, it unlocks with the
  **إعادة التشغيل ماتأكدتش** warning card.
- **To see what another phone sees during a real restart:** publish
  `cmd: [RESTART] from أحمد` to `home/pump/log`. **Expect:** the lock shows **أحمد · 6 ث**
  plus a toast **أحمد بدأ إعادة تشغيل**.

### 4. The buttons publish `CMD:<name>` with retain OFF

- In the web client, subscribe to `home/pump/cmd`.
- Keep the app live by publishing an `hb`, then tap the dial.
- **Expect:** `OFF:محمد` (or `ON:محمد`) arrives. With no controller present, the app
  shows **الأمر ماتنفّذش** after 5 s, and the displayed state does **not** change.
- Tap **إعادة تشغيل → إعادة تشغيل**. **Expect:** `RESTART:محمد`.
- Opening the app, or tapping **تأكد من وحدة التحكم**, sends a bare `STATUS`.

**Proving retain is off.** The retain flag shown on a message you receive live proves
nothing. MQTT 3.1.1 brokers clear the flag on live delivery to an existing subscriber,
even when the publisher set it. The real test:

1. After the app has published a command, **unsubscribe** from `home/pump/cmd` in the web
   client.
2. **Subscribe again.**
3. **Expect: nothing arrives.** A retained command would be delivered immediately on
   subscribe, and it would also be replayed to the ESP32 on its next reconnect.
4. If one ever does show up, clear it by publishing an empty message to `home/pump/cmd`
   with Retain on.

### Cleaning up after testing

To wipe test values, publish an **empty** message with **Retain on** to
`home/pump/state` and `home/pump/users`. Then clear the app with
**Settings → امسح اسمي من الموبايل ده**.

---

## Updating the app

Edit the files and push. Then **bump `VERSION` in `sw.js`**, for example
`pumplink-v1.0.1`, so phones drop the old cached shell. The page itself is fetched
network-first, so a phone that is online picks up the change on its next open.

---

## Design notes

The visual language comes from the Claude Design export: the colours, the glass cards,
the dial states, the pill and card styles, and the three glyph images. Where the brief
required different behaviour, it was agreed as follows:

- Arabic RTL in Egyptian colloquial. Readex Pro supplies the Arabic letters, and Archivo
  and Archivo Narrow are kept for Latin text and numbers.
- The phone frame and the fake status bar were removed. The MQTT indicator is in the top
  bar.
- Connection settings are per phone and editable by anyone. The admin role only governs
  the family list.
- Base topic, device ID and restart duration are fixed by the firmware, so they are not
  editable.
- Removed because nothing backs them: presence ("Active now"), the push toggle, and the
  demo section.
- "Manual mode" was repurposed as **"changed without the app"**.
- The fault card is driven by the firmware's `MISMATCH` log line.
- The firmware version in Settings is the real `fw` and `build` from the STATUS reply.
