'use strict';

const express = require('express');
const audit = require('../services/audit');
const { validate, auditQuerySchema } = require('../utils/validate');

const router = express.Router();

router.get('/filters', (req, res) => {
  res.json({
    actions: audit.distinctValues('action'),
    admins: audit.distinctValues('admin'),
  });
});

router.get('/', (req, res) => {
  const filters = validate(auditQuerySchema, req.query);
  res.json(audit.query(filters));
});

module.exports = router;
