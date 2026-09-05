const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  ROLES,
  createToken,
  hashPassword,
  verifyPassword,
  getSessionExpiry,
  hasPermission
} = require("./auth");

const app = express();

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readData() {
  try {
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    data.users ||= [];
    data.orders ||= [];
    data.customers ||= [];
    data.suppliers ||= [];
    data.warehouses ||= [];
    data.items ||= [];
    data.auditLog ||= [];
    data.sessions ||= [];

    return data;
  } catch {
    return {
      users: [],
      orders: [],
      customers: [],
      suppliers: [],
      warehouses: [],
      items: [],
      auditLog: [],
      sessions: []
    };
  }
}

function writeData(data) {
  const temp = DATA_FILE + ".tmp";

  fs.writeFileSync(
    temp,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  fs.renameSync(temp, DATA_FILE);
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active !== false
  };
}

function findUser(data, username) {
  return data.users.find(
    u =>
      String(u.username).toLowerCase() ===
      String(username).toLowerCase()
  );
}

function getSessionUser(req) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.substring(7)
    : null;

  if (!token) return null;

  const data = readData();

  const session = data.sessions.find(
    s => s.token === token
  );

  if (!session) return null;

  if (
    new Date(session.expiresAt).getTime() <
    Date.now()
  ) {
    return null;
  }

  return data.users.find(
    u => u.id === session.userId && u.active !== false
  );
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "يجب تسجيل الدخول أولاً"
    });
  }

  req.user = user;
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        ok: false,
        error: "ليس لديك صلاحية لتنفيذ هذه العملية"
      });
    }

    next();
  };
}

function addAudit(
  data,
  user,
  action,
  entity,
  entityId,
  details = {}
) {
  data.auditLog.push({
    id:
      "LOG-" +
      Date.now() +
      "-" +
      crypto.randomBytes(3).toString("hex"),

    userId: user?.id || null,
    userName: user?.name || "النظام",
    action,
    entity,
    entityId: entityId || null,
    details,
    createdAt: new Date().toISOString()
  });
}

/*
========================================
 HEALTH
========================================
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
========================================
 CREATE INITIAL ADMIN
========================================
*/

app.post("/api/setup", async (req, res) => {
  try {
    const data = readData();

    if (data.users.length > 0) {
      return res.status(403).json({
        ok: false,
        error: "تم إعداد النظام بالفعل"
      });
    }

    const password =
      req.body.password || "ChangeMe123!";

    const passwordHash =
      await hashPassword(password);

    const admin = {
      id: "U-0001",
      name: req.body.name || "صاحب المؤسسة",
      username: req.body.username || "admin",
      passwordHash,
      role: "admin",
      active: true,
      createdAt: new Date().toISOString()
    };

    data.users.push(admin);

    addAudit(
      data,
      admin,
      "SYSTEM_SETUP",
      "user",
      admin.id,
      {
        username: admin.username
      }
    );

    writeData(data);

    res.json({
      ok: true,
      message: "تم إنشاء حساب صاحب المؤسسة",
      user: safeUser(admin)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "تعذر إعداد النظام"
    });
  }
});

/*
========================================
 LOGIN
========================================
*/

app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: "اسم المستخدم وكلمة المرور مطلوبان"
      });
    }

    const data = readData();

    const user = findUser(
      data,
      username
    );

    if (!user || user.active === false) {
      return res.status(401).json({
        ok: false,
        error: "بيانات الدخول غير صحيحة"
      });
    }

    /*
      المستخدم القديم الذي كان يستخدم password
      سيتم دعمه مؤقتاً.
    */

    let valid = false;

    if (user.passwordHash) {
      valid = await verifyPassword(
        password,
        user.passwordHash
      );
    } else if (user.password) {
      valid =
        user.password === password;

      if (valid) {
        user.passwordHash =
          await hashPassword(password);

        delete user.password;
      }
    }

    if (!valid) {
      return res.status(401).json({
        ok: false,
        error: "بيانات الدخول غير صحيحة"
      });
    }

    const token = createToken();

    data.sessions =
      data.sessions.filter(
        session =>
          new Date(session.expiresAt).getTime() >
          Date.now()
      );

    data.sessions.push({
      token,
      userId: user.id,
      expiresAt:
        getSessionExpiry().toISOString(),
      createdAt:
        new Date().toISOString()
    });

    addAudit(
      data,
      user,
      "LOGIN",
      "user",
      user.id
    );

    writeData(data);

    res.json({
      ok: true,
      token,
      user: safeUser(user),
      role: ROLES[user.role] || null
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "حدث خطأ أثناء تسجيل الدخول"
    });
  }
});

/*
========================================
 CURRENT USER
========================================
*/

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) => {
    res.json({
      ok: true,
      user: safeUser(req.user),
      role: ROLES[req.user.role] || null
    });
  }
);

/*
========================================
 LOGOUT
========================================
*/

app.post(
  "/api/auth/logout",
  requireAuth,
  (req, res) => {
    const data = readData();

    const token =
      req.headers.authorization?.substring(7);

    data.sessions =
      data.sessions.filter(
        s => s.token !== token
      );

    addAudit(
      data,
      req.user,
      "LOGOUT",
      "user",
      req.user.id
    );

    writeData(data);

    res.json({
      ok: true
    });
  }
);

/*
========================================
 DATA
========================================
*/

app.get(
  "/api/data",
  requireAuth,
  (req, res) => {
    const data = readData();

    const safeData = {
      ...data,

      users: data.users.map(
        safeUser
      ),

      sessions: undefined
    };

    delete safeData.sessions;

    res.json(safeData);
  }
);

/*
========================================
 SAVE DATA
========================================

مؤقتاً نحافظ على طريقة النظام القديمة
حتى لا تتعطل الواجهة الحالية.
*/

app.post(
  "/api/data",
  requireAuth,
  (req, res) => {
    try {
      const incoming = req.body;

      if (
        !incoming ||
        typeof incoming !== "object"
      ) {
        return res.status(400).json({
          ok: false,
          error: "بيانات غير صحيحة"
        });
      }

      const current = readData();

      /*
        المستخدم العادي لا يستطيع تغيير
        المستخدمين من خلال API البيانات.
      */

      incoming.users =
        current.users;

      incoming.sessions =
        current.sessions;

      incoming.auditLog =
        current.auditLog;

      writeData(incoming);

      addAudit(
        incoming,
        req.user,
        "DATA_SAVE",
        "system",
        null
      );

      writeData(incoming);

      res.json({
        ok: true,
        message: "تم الحفظ"
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: "تعذر الحفظ"
      });
    }
  }
);

/*
========================================
 AUDIT LOG
========================================
*/

app.get(
  "/api/audit",
  requireAuth,
  requirePermission("*"),
  (req, res) => {
    const data = readData();

    res.json({
      ok: true,
      logs:
        data.auditLog
          .slice()
          .reverse()
    });
  }
);

/*
========================================
 START
========================================
*/

app.listen(PORT, () => {
  console.log(
    "Order Flow ERP يعمل على المنفذ " +
    PORT
  );
});
