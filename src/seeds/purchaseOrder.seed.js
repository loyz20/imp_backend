const mongoose = require('mongoose');
const config = require('../config');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const { PO_STATUS } = require('../constants');
const logger = require('../utils/logger');

const seedPurchaseOrders = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected for seeding purchase orders');

    const existingCount = await PurchaseOrder.countDocuments();
    if (existingCount > 0) {
      logger.warn(`Database already has ${existingCount} purchase orders. Use --force to reseed.`);
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      logger.info('Force flag detected. Clearing existing purchase orders...');
      await PurchaseOrder.deleteMany({});
    }

    // Get existing suppliers and products
    const suppliers = await Supplier.find({ isActive: true }).lean();
    const products = await Product.find({ isActive: true }).lean();

    if (suppliers.length < 2 || products.length < 3) {
      logger.error('Need at least 2 suppliers and 3 products. Run supplier and product seeds first.');
      process.exit(1);
    }

    const purchaseOrders = [
      {
        supplierId: suppliers[0]._id,
        orderDate: new Date('2026-04-01'),
        expectedDeliveryDate: new Date('2026-04-08'),
        paymentTermDays: 30,
        status: PO_STATUS.SENT,
        sentAt: new Date('2026-04-01T14:00:00Z'),
        notes: 'Kebutuhan stok rutin bulan April 2026',
        items: [
          { productId: products[0]._id, satuan: 'Box', quantity: 100, unitPrice: 85000, discount: 5 },
          { productId: products[1]._id, satuan: 'Box', quantity: 200, unitPrice: 45000, discount: 0 },
        ],
      },
      {
        supplierId: suppliers[1]._id,
        orderDate: new Date('2026-04-02'),
        expectedDeliveryDate: new Date('2026-04-10'),
        paymentTermDays: 45,
        status: PO_STATUS.SENT,
        sentAt: new Date('2026-04-02T10:00:00Z'),
        notes: 'Pengadaan produk baru Q2 2026',
        items: [
          { productId: products[2]._id, satuan: 'Box', quantity: 50, unitPrice: 125000, discount: 10 },
          { productId: products[3]._id, satuan: 'Box', quantity: 80, unitPrice: 35000, discount: 0 },
        ],
      },
      {
        supplierId: suppliers[0]._id,
        orderDate: new Date('2026-04-02'),
        paymentTermDays: 30,
        status: PO_STATUS.DRAFT,
        notes: 'Draft PO - menunggu konfirmasi harga',
        items: [
          { productId: products[4]._id, satuan: 'Box', quantity: 30, unitPrice: 250000, discount: 0 },
        ],
      },
    ];

    const created = [];
    for (const poData of purchaseOrders) {
      const po = await PurchaseOrder.create(poData);
      created.push(po);
    }

    logger.info(`✓ Seeded ${created.length} purchase orders successfully`);
    created.forEach((po) => {
      logger.info(`  - ${po.poNumber} [${po.status}] Total: Rp ${po.totalAmount.toLocaleString('id-ID')}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`Purchase order seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedPurchaseOrders();
