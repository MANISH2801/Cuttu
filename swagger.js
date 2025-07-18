// swagger/swaggerSpec.js

const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Prep360 API Docs',
      version: '1.0.0',
      description: 'Swagger documentation for Prep360 backend',
    },
    servers: [
      {
        url: 'https://your-domain.com', // Replace with real domain when deployed
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'], // All route files with Swagger comments
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
