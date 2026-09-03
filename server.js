const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ملف قاعدة البيانات
const DATA_FILE = path.join(__dirname, 'data.json');

// قراءة البيانات
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // إذا كان الملف غير موجود، إنشاء بيانات افتراضية
        const defaultData = {
            users: [
                { id: 'u1', username: 'admin', password: 'admin123', role: 'admin', name: 'مدير النظام', phone: '01000000000' },
                { id: 'u2', username: 'sales', password: 'sales123', role: 'sales', name: 'أحمد محمد', phone: '01011111111' },
                { id: 'u3', username: 'logistics', password: 'log123', role: 'logistics', name: 'خالد علي', phone: '01022222222' },
                { id: 'u4', username: 'accounts', password: 'acc123', role: 'accounts', name: 'سارة أحمد', phone: '01033333333' },
                { id: 'u5', username: 'warehouse', password: 'ware123', role: 'warehouse', name: 'محمد إبراهيم', phone: '01044444444' },
                { id: 'u6', username: 'driver1', password: 'driver123', role: 'driver', name: 'سائق 1', phone: '01055555555' },
                { id: 'u7', username: 'driver2', password: 'driver123', role: 'driver', name: 'سائق 2', phone: '01066666666' },
            ],
            orders: [
                {
                    id: 'SO-1001',
                    type: 'sale',
                    partyName: 'محمد علي',
                    phone: '01012345678',
                    address: 'شارع النيل، القاهرة',
                    taxInvoice: true,
                    paymentMethod: 'نقدي',
                    items: [{ name: 'جهاز لابتوب', qty: 2, price: 15000 }],
                    shippingCost: 200,
                    finalTotal: 30200,
                    stage: 'with_driver',
                    driverName: 'سائق 1',
                    driverPhone: '01055555555',
                    createdBy: 'أحمد محمد',
                    createdAt: new Date().toISOString(),
                    history: [
                        { stage: 'sales_created', by: 'أحمد محمد', note: 'تم إنشاء الأمر', at: new Date().toISOString() },
                        { stage: 'logistics_review', by: 'النظام', note: 'تم تحويل للنقل', at: new Date().toISOString() },
                        { stage: 'with_driver', by: 'النظام', note: 'تم تحويل للسائق', at: new Date().toISOString() }
                    ],
                    driverStatus: 'pending'
                }
            ],
            customers: [
                { name: 'محمد علي', phone: '01012345678', address: 'شارع النيل، القاهرة', orderIds: ['SO-1001'] }
            ],
            suppliers: [],
            whatsappLogs: []
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

// حفظ البيانات
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==================== API ENDPOINTS ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const data = readData();
    const user = data.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        // لا نرسل كلمة المرور
        const { password, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
    } else {
        res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
});

// جلب جميع البيانات
app.get('/api/data', (req, res) => {
    const data = readData();
    // لا نرسل كلمات المرور
    data.users = data.users.map(u => {
        const { password, ...user } = u;
        return user;
    });
    res.json(data);
});

// جلب طلب معين
app.get('/api/orders/:id', (req, res) => {
    const data = readData();
    const order = data.orders.find(o => o.id === req.params.id);
    if (order) {
        res.json(order);
    } else {
        res.status(404).json({ error: 'الطلب غير موجود' });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', (req, res) => {
    const data = readData();
    const newOrder = {
        ...req.body,
        id: 'SO-' + Date.now(),
        createdAt: new Date().toISOString(),
        history: [
            { stage: 'sales_created', by: req.body.createdBy || 'المستخدم', note: 'تم إنشاء الأمر', at: new Date().toISOString() },
            { stage: 'logistics_review', by: 'النظام', note: 'تم تحويل للنقل', at: new Date().toISOString() }
        ],
        stage: 'logistics_review',
        driverStatus: null
    };
    
    data.orders.unshift(newOrder);
    
    // إضافة للعميل
    if (newOrder.type === 'sale') {
        let customer = data.customers.find(c => c.name === newOrder.partyName && c.phone === newOrder.phone);
        if (!customer) {
            customer = { name: newOrder.partyName, phone: newOrder.phone, address: newOrder.address, orderIds: [] };
            data.customers.push(customer);
        }
        customer.orderIds.push(newOrder.id);
    } else {
        let supplier = data.suppliers.find(s => s.name === newOrder.partyName && s.phone === newOrder.phone);
        if (!supplier) {
            supplier = { name: newOrder.partyName, phone: newOrder.phone, address: newOrder.address, orderIds: [] };
            data.suppliers.push(supplier);
        }
        supplier.orderIds.push(newOrder.id);
    }
    
    writeData(data);
    res.json(newOrder);
});

// تحديث حالة طلب
app.put('/api/orders/:id', (req, res) => {
    const data = readData();
    const index = data.orders.findIndex(o => o.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
    }
    
    data.orders[index] = { ...data.orders[index], ...req.body };
    writeData(data);
    res.json(data.orders[index]);
});

// تحديث حالة الطلب من السائق
app.post('/api/orders/:id/driver-status', (req, res) => {
    const { status, note } = req.body;
    const data = readData();
    const order = data.orders.find(o => o.id === req.params.id);
    
    if (!order) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
    }
    
    const statusLabels = {
        delivered: 'تم التسليم',
        not_delivered: 'لم يتم التسليم',
        problem: 'يوجد مشكلة'
    };
    
    order.driverStatus = status;
    order.stage = status === 'delivered' ? 'delivered' : 'with_driver';
    
    order.history.push({
        stage: order.stage,
        by: order.driverName || 'السائق',
        note: `تحديث من السائق: ${statusLabels[status]}${note ? ' - ' + note : ''}`,
        at: new Date().toISOString()
    });
    
    writeData(data);
    res.json(order);
});

// إرسال رسالة واتساب
app.post('/api/whatsapp/send', (req, res) => {
    const { orderId, phone, message } = req.body;
    const data = readData();
    
    // تسجيل الرسالة
    data.whatsappLogs = data.whatsappLogs || [];
    data.whatsappLogs.push({
        orderId,
        phone,
        message,
        sentAt: new Date().toISOString()
    });
    
    writeData(data);
    
    // في الإنتاج، استخدم Twilio أو WhatsApp Business API هنا
    res.json({ 
        success: true, 
        message: 'تم إرسال الرسالة',
        whatsappLink: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    });
});

// جلب إحصائيات
app.get('/api/stats', (req, res) => {
    const data = readData();
    const stats = {
        totalOrders: data.orders.length,
        pendingOrders: data.orders.filter(o => o.stage !== 'delivered').length,
        deliveredOrders: data.orders.filter(o => o.stage === 'delivered').length,
        totalCustomers: data.customers.length,
        totalSuppliers: data.suppliers.length
    };
    res.json(stats);
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 خادم رصرص للتوكيلات التجارية يعمل على http://localhost:${PORT}`);
});
