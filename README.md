# ROCKSTAR License Server

## Setup (5 minutes)

1. Server folder me jao:
```bash
cd license-server
npm install
```

2. Server start karo:
```bash
npm start
```

Server chalega: http://localhost:3847

Admin Panel: http://localhost:3847/admin

**Default Admin Secret:** `ROCKSTAR_ADMIN_2026`  
(Production me change kar dena: `ADMIN_SECRET=your_secret npm start`)

---

## Extension me Server URL set karo

File kholo: `ewpntwciqyxepolqqvct.js`

Is line ko apne server se replace karo:

```js
const LICENSE_SERVER = "https://YOUR-SERVER-URL.com";  // <-- CHANGE THIS
```

Example:
- Local testing: `http://localhost:3847`
- Online (Render/Railway/VPS): `https://your-app.onrender.com`

Phir extension reload karo.

---

## Kaise use kare

### 1. Key Generate karo
- Admin panel kholo → Generate button
- Keys aayenge jaise: `ABHD ODHS JSJS KQWE`

### 2. User ko key do
User extension me key daalega → 1 device me bind ho jayega.

### 3. Ban karna hai?
Admin panel me us key ke saamne **Ban** dabao.
Extension 5 min ke andar band ho jayega (ya next open pe).

### 4. Naya device allow karna hai?
**Reset Device** dabao → purana binding hat jayega → naya PC pe activate kar sakta hai.

---

## Deploy free online (Render.com example)

1. GitHub pe repo banao, license-server folder push karo
2. Render.com → New Web Service → connect repo
3. Build: `npm install`
4. Start: `npm start`
5. Environment: `ADMIN_SECRET=strongpassword123`
6. Deploy → URL mil jayega (https://xxx.onrender.com)
7. Us URL ko extension ke `LICENSE_SERVER` me daal do

---

## API Quick Reference

| Action          | Endpoint                  | Method |
|-----------------|---------------------------|--------|
| Validate key    | /api/validate             | POST   |
| Status check    | /api/status               | POST   |
| Generate keys   | /api/admin/generate       | POST   |
| Ban key         | /api/admin/ban            | POST   |
| Unban           | /api/admin/unban          | POST   |
| Reset device    | /api/admin/reset-device   | POST   |
| List all        | /api/admin/list           | GET    |

Admin endpoints me header: `x-admin-secret: YOUR_SECRET`
