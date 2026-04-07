const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./index');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PBF App IKO - API',
      version: '1.0.0',
      description:
        'REST API untuk Sistem Informasi Pedagang Besar Farmasi (PBF). Mencakup manajemen user, autentikasi, dan pengaturan aplikasi.',
      contact: {
        name: 'API Support',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Autentikasi & manajemen akun' },
      { name: 'Users', description: 'Manajemen user (Admin only)' },
      {
        name: 'Settings',
        description: 'Pengaturan aplikasi PBF (Admin only)',
      },
      {
        name: 'Settings - Sections',
        description: 'Update pengaturan per section',
      },
      {
        name: 'Settings - Document Number',
        description: 'Generate & reset nomor dokumen',
      },
      { name: 'Goods Receiving', description: 'Manajemen penerimaan barang' },
      { name: 'Sales Order', description: 'Manajemen pesanan penjualan' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Masukkan token JWT. Contoh: "eyJhbG..."',
        },
      },
      schemas: {
        // ─── Common ───
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
            ...(config.env === 'development' && {
              stack: { type: 'string' },
            }),
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: {
                    type: 'string',
                    example: 'Email is required',
                  },
                },
              },
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            totalDocs: { type: 'integer', example: 50 },
            totalPages: { type: 'integer', example: 5 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false },
            nextPage: { type: 'integer', nullable: true, example: 2 },
            prevPage: { type: 'integer', nullable: true, example: null },
          },
        },

        // ─── User ───
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'John Doe' },
            email: {
              type: 'string',
              format: 'email',
              example: 'john@example.com',
            },
            phone: { type: 'string', example: '08123456789' },
            role: {
              type: 'string',
              enum: ['admin', 'user'],
              example: 'user',
            },
            avatar: { type: 'string', nullable: true },
            isActive: { type: 'boolean', example: true },
            isEmailVerified: { type: 'boolean', example: false },
            address: { $ref: '#/components/schemas/Address' },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Address: {
          type: 'object',
          properties: {
            street: { type: 'string', example: 'Jl. Sudirman No. 1' },
            city: { type: 'string', example: 'Jakarta' },
            province: { type: 'string', example: 'DKI Jakarta' },
            postalCode: { type: 'string', example: '10110' },
            country: { type: 'string', example: 'Indonesia' },
          },
        },
        UserListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                docs: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },
        UserStats: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 100 },
                active: { type: 'integer', example: 85 },
                inactive: { type: 'integer', example: 15 },
                byRole: {
                  type: 'object',
                  properties: {
                    admin: { type: 'integer', example: 5 },
                    user: { type: 'integer', example: 95 },
                  },
                },
              },
            },
          },
        },

        // ─── Auth ───
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Login berhasil' },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                tokens: { $ref: '#/components/schemas/AuthTokens' },
              },
            },
          },
        },

        // ─── AppSetting ───
        License: {
          type: 'object',
          properties: {
            number: { type: 'string', example: 'PBF-12345' },
            issuedDate: { type: 'string', format: 'date' },
            expiryDate: { type: 'string', format: 'date' },
            document: { type: 'string', nullable: true },
          },
        },
        LicenseWarning: {
          type: 'object',
          properties: {
            license: { type: 'string', example: 'PBF' },
            number: { type: 'string' },
            expiryDate: { type: 'string', format: 'date' },
            daysUntilExpiry: { type: 'integer', example: 25 },
            status: {
              type: 'string',
              enum: ['expired', 'expiring_soon'],
            },
          },
        },
        DocNumberResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                docNumber: {
                  type: 'string',
                  example: 'INV/202603/000001',
                },
              },
            },
          },
        },

        // ─── Goods Receiving ───
        GoodsReceivingItem: {
          type: 'object',
          properties: {
            productId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Product ID',
              example: '507f1f77bcf86cd799439011'
            },
            satuan: {
              type: 'string',
              description: 'Unit of measurement',
              example: 'Box'
            },
            unitPrice: {
              type: 'number',
              description: 'Unit price',
              example: 50000
            },
            discount: {
              type: 'number',
              description: 'Discount percentage',
              example: 0
            },
            orderedQty: {
              type: 'number',
              description: 'Ordered quantity',
              example: 10
            },
            receivedQty: {
              type: 'number',
              description: 'Received quantity',
              example: 10
            },
            batchNumber: {
              type: 'string',
              description: 'Batch number',
              example: 'BATCH123'
            },
            expiryDate: {
              type: 'string',
              format: 'date',
              description: 'Expiry date',
              example: '2025-12-31'
            },
            manufacturingDate: {
              type: 'string',
              format: 'date',
              description: 'Manufacturing date',
              example: '2024-01-01'
            },
            storageCondition: {
              type: 'string',
              enum: ['Suhu Kamar', 'Sejuk', 'Dingin', 'Beku'],
              description: 'Storage condition',
              example: 'Suhu Kamar'
            },
            conditionStatus: {
              type: 'string',
              enum: ['baik', 'rusak', 'cacat'],
              description: 'Item condition',
              example: 'baik'
            },
            notes: {
              type: 'string',
              description: 'Item notes',
              example: 'Kondisi baik'
            }
          },
          required: ['productId', 'satuan', 'unitPrice', 'receivedQty', 'batchNumber', 'expiryDate']
        },
        GoodsReceiving: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'ObjectId',
              description: 'Goods receiving ID',
              example: '507f1f77bcf86cd799439011'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number',
              example: 'INV/2024/001'
            },
            status: {
              type: 'string',
              enum: ['draft', 'checked', 'verified', 'completed'],
              description: 'Goods receiving status',
              example: 'draft'
            },
            purchaseOrderId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Purchase order ID',
              example: '507f1f77bcf86cd799439012'
            },
            supplierId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Supplier ID',
              example: '507f1f77bcf86cd799439013'
            },
            receivingDate: {
              type: 'string',
              format: 'date',
              description: 'Receiving date',
              example: '2024-01-01'
            },
            deliveryNote: {
              type: 'string',
              description: 'Delivery note number',
              example: 'SJ/2024/001'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/GoodsReceivingItem' },
              description: 'Received items'
            },
            notes: {
              type: 'string',
              description: 'Goods receiving notes',
              example: 'Barang diterima dengan baik'
            },
            verifiedBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Verified by user ID'
            },
            verifiedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Verification date'
            },
            verificationNotes: {
              type: 'string',
              description: 'Verification notes'
            },
            receivedBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Received by user ID'
            },
            createdBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Created by user ID'
            },
            updatedBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Updated by user ID'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation date'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update date'
            }
          },
          required: ['invoiceNumber', 'supplierId', 'receivingDate', 'items']
        },
        CreateGoodsReceiving: {
          type: 'object',
          properties: {
            purchaseOrderId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Purchase order ID (optional)'
            },
            supplierId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Supplier ID (required if no purchase order)'
            },
            receivingDate: {
              type: 'string',
              format: 'date',
              description: 'Receiving date',
              example: '2024-01-01'
            },
            deliveryNote: {
              type: 'string',
              description: 'Delivery note number',
              example: 'SJ/2024/001'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number',
              example: 'INV/2024/001'
            },
            notes: {
              type: 'string',
              description: 'Goods receiving notes',
              example: 'Barang diterima dengan baik'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/GoodsReceivingItem' },
              description: 'Received items'
            }
          },
          required: ['invoiceNumber', 'supplierId', 'receivingDate', 'items']
        },
        UpdateGoodsReceiving: {
          type: 'object',
          properties: {
            purchaseOrderId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Purchase order ID'
            },
            supplierId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Supplier ID'
            },
            receivingDate: {
              type: 'string',
              format: 'date',
              description: 'Receiving date'
            },
            deliveryNote: {
              type: 'string',
              description: 'Delivery note number'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number'
            },
            notes: {
              type: 'string',
              description: 'Goods receiving notes'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/GoodsReceivingItem' },
              description: 'Received items'
            }
          }
        },

        // ─── Sales Order ───
        SalesOrderItem: {
          type: 'object',
          properties: {
            productId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Product ID',
              example: '507f1f77bcf86cd799439011'
            },
            satuan: {
              type: 'string',
              description: 'Unit of measurement',
              example: 'Box'
            },
            quantity: {
              type: 'number',
              description: 'Quantity',
              example: 10
            },
            unitPrice: {
              type: 'number',
              description: 'Unit price',
              example: 50000
            },
            discount: {
              type: 'number',
              description: 'Discount percentage',
              example: 0
            },
            subtotal: {
              type: 'number',
              description: 'Subtotal amount',
              example: 500000
            },
            batchNumber: {
              type: 'string',
              description: 'Batch number',
              example: 'BATCH123'
            },
            expiryDate: {
              type: 'string',
              format: 'date',
              description: 'Expiry date',
              example: '2025-12-31'
            },
            notes: {
              type: 'string',
              description: 'Item notes',
              example: 'Khusus untuk apotek'
            }
          },
          required: ['productId', 'satuan', 'quantity', 'unitPrice']
        },
        SalesOrder: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'ObjectId',
              description: 'Sales order ID',
              example: '507f1f77bcf86cd799439011'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number',
              example: 'SO/2024/001'
            },
            status: {
              type: 'string',
              enum: ['draft', 'packed', 'delivered', 'partial_delivered', 'returned', 'completed', 'canceled'],
              description: 'Sales order status',
              example: 'draft'
            },
            customerId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Customer ID',
              example: '507f1f77bcf86cd799439012'
            },
            orderDate: {
              type: 'string',
              format: 'date',
              description: 'Order date',
              example: '2024-01-01'
            },
            expectedDeliveryDate: {
              type: 'string',
              format: 'date',
              description: 'Expected delivery date',
              example: '2024-01-05'
            },
            paymentTermDays: {
              type: 'number',
              description: 'Payment term in days',
              example: 30
            },
            subtotal: {
              type: 'number',
              description: 'Subtotal amount',
              example: 500000
            },
            ppnAmount: {
              type: 'number',
              description: 'PPN amount',
              example: 55000
            },
            totalAmount: {
              type: 'number',
              description: 'Total amount',
              example: 555000
            },
            shippingAddress: {
              type: 'string',
              description: 'Shipping address',
              example: 'Jl. Sudirman No. 1, Jakarta'
            },
            notes: {
              type: 'string',
              description: 'Sales order notes',
              example: 'Pesanan khusus untuk apotek'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/SalesOrderItem' },
              description: 'Order items'
            },
            packedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Packed date'
            },
            deliveredAt: {
              type: 'string',
              format: 'date-time',
              description: 'Delivered date'
            },
            returnedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Returned date'
            },
            confirmedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Confirmed date'
            },
            processedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Processed date'
            },
            shippedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Shipped date'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Completed date'
            },
            createdBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Created by user ID'
            },
            updatedBy: {
              type: 'string',
              format: 'ObjectId',
              description: 'Updated by user ID'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation date'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update date'
            }
          },
          required: ['invoiceNumber', 'customerId', 'orderDate', 'items']
        },
        CreateSalesOrder: {
          type: 'object',
          properties: {
            customerId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Customer ID',
              example: '507f1f77bcf86cd799439012'
            },
            orderDate: {
              type: 'string',
              format: 'date',
              description: 'Order date',
              example: '2024-01-01'
            },
            expectedDeliveryDate: {
              type: 'string',
              format: 'date',
              description: 'Expected delivery date',
              example: '2024-01-05'
            },
            paymentTermDays: {
              type: 'number',
              description: 'Payment term in days',
              example: 30
            },
            shippingAddress: {
              type: 'string',
              description: 'Shipping address',
              example: 'Jl. Sudirman No. 1, Jakarta'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number',
              example: 'SO/2024/001'
            },
            notes: {
              type: 'string',
              description: 'Sales order notes',
              example: 'Pesanan khusus untuk apotek'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/SalesOrderItem' },
              description: 'Order items'
            }
          },
          required: ['invoiceNumber', 'customerId', 'orderDate', 'items']
        },
        UpdateSalesOrder: {
          type: 'object',
          properties: {
            customerId: {
              type: 'string',
              format: 'ObjectId',
              description: 'Customer ID'
            },
            orderDate: {
              type: 'string',
              format: 'date',
              description: 'Order date'
            },
            expectedDeliveryDate: {
              type: 'string',
              format: 'date',
              description: 'Expected delivery date'
            },
            paymentTermDays: {
              type: 'number',
              description: 'Payment term in days'
            },
            shippingAddress: {
              type: 'string',
              description: 'Shipping address'
            },
            invoiceNumber: {
              type: 'string',
              description: 'Invoice number'
            },
            notes: {
              type: 'string',
              description: 'Sales order notes'
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/SalesOrderItem' },
              description: 'Order items'
            }
          }
        },
        PurchaseOrder: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'ObjectId',
              description: 'Purchase order ID',
              example: '507f1f77bcf86cd799439011'
            },
            poNumber: {
              type: 'string',
              description: 'Purchase order number',
              example: 'PO/2024/001'
            },
            status: {
              type: 'string',
              description: 'Purchase order status',
              example: 'approved'
            }
          }
        },
      },

      // ─── Reusable Parameters ───
      parameters: {
        PageParam: {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Nomor halaman',
        },
        LimitParam: {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          description: 'Jumlah data per halaman (max 100)',
        },
        SortParam: {
          in: 'query',
          name: 'sort',
          schema: { type: 'string', default: '-createdAt' },
          description:
            'Field untuk sorting. Prefix `-` untuk descending. Contoh: `-createdAt`, `name`',
        },
        SearchParam: {
          in: 'query',
          name: 'search',
          schema: { type: 'string' },
          description: 'Cari berdasarkan nama atau email',
        },
        IdParam: {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string' },
          description: 'MongoDB ObjectId',
        },
      },

      // ─── Reusable Responses ───
      responses: {
        Unauthorized: {
          description: 'Token tidak valid atau tidak disediakan',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Unauthorized - Token required',
              },
            },
          },
        },
        Forbidden: {
          description: 'Tidak memiliki akses',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Forbidden - Admin access required',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource tidak ditemukan',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, message: 'Resource not found' },
            },
          },
        },
        ValidationFailed: {
          description: 'Validasi gagal',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationError' },
            },
          },
        },
        TooManyRequests: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                message: 'Too many requests, please try again later',
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
