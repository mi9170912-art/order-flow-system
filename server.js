const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (!data.users) data.users = [];
    if (!data.orders) data.orders = [];
    if (!data.customers) data.customers = [];
    if (!data.suppliers) data.suppliers = [];
    if (!data.warehouses) data.warehouses = [];
    if (!data.items) data.items = [];
    if (!data.auditLog) data.auditLog = [];

    return data;
  } catch (error) {
    return {
      users: [],
      orders: [],
      customers: [],
      suppliers: [],
      warehouses: [],
      items: [],
      auditLog: []
    };
  }
}

function writeData(data) {
  const tempFile = DATA_FILE + ".tmp";

  fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  fs.renameSync(tempFile, DATA_FILE);
}

/*
  إنشاء رقم عشوائي آمن
*/
function createId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

/*
  تسجيل حركة في النظام
*/
function addAuditLog(data, action, user, entity, entityId, details = {}) {
  data.auditLog.push({
    id: createId("LOG"),
    action,
    userId: user?.id || null,
    userName: user?.name || "النظام",
    entity,
    entityId: entityId || null,
    details,
    createdAt: new Date().toISOString()
  });
}

/*
  API فحص النظام
*/
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    system: "Order Flow ERP",
    version: "1.1.0",
    time: new Date().toISOString()
  });
});

/*
  جلب البيانات
*/
app.get("/api/data", (req, res) => {
  try {
    const data = readData();

    /*
      لا نرسل كلمات السر للواجهة
    */
    const safeData = {
      ...data,
      users: data.users.map(user => {
        const copy = { ...user };
        delete copy.password;
        delete copy.passwordHash;
        return copy;
      })
    };

    res.json(safeData);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "تعذر تحميل بيانات النظام"
    });
  }
});

/*
  حفظ البيانات
  مؤقتًا سنبقي الـ API القديم حتى لا يتعطل النظام الحالي.
*/
app.post("/api/data", (req, res) => {
  try {
    const incoming = req.body;

    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({
        ok: false,
        error: "بيانات غير صحيحة"
      });
    }

    const current = readData();

    /*
      حماية أساسية:
      لا نسمح بإرسال users بدون الحفاظ على بيانات المستخدمين الحالية.
    */
    if (Array.isArray(incoming.users)) {
      incoming.users = incoming.users.map(user => {
        const oldUser = current.users.find(
          u => u.id === user.id
        );

        return {
          ...user,
          password:
            user.password ||
            oldUser?.password ||
            undefined,
          passwordHash:
            user.passwordHash ||
            oldUser?.passwordHash ||
            undefined
        };
      });
    }

    writeData(incoming);

    res.json({
      ok: true,
      message: "تم الحفظ بنجاح"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "تعذر حفظ البيانات"
    });
  }
});

/*
  إنشاء سجل تدقيق يدوي
*/
app.post("/api/audit", (req, res) => {
  try {
    const {
      action,
      user,
      entity,
      entityId,
      details
    } = req.body;

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "يجب تحديد العملية"
      });
    }

    const data = readData();

    addAuditLog(
      data,
      action,
      user,
      entity,
      entityId,
      details
    );

    writeData(data);

    res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "تعذر تسجيل الحركة"
    });
  }
});

/*
  تشغيل النظام
*/
app.listen(PORT, () => {
  console.log(
    `Order Flow ERP يعمل على المنفذ ${PORT}`
  );
});
