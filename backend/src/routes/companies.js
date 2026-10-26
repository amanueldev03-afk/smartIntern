import express from 'express';
import { Company } from '../models/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const companies = await Company.findAll({ order: [['name', 'ASC']] });
    return res.status(200).json(companies);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.create(req.body);
    return res.status(201).json(company);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/:id/', async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ detail: 'Company not found.' });
    return res.status(200).json(company);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.put('/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ detail: 'Company not found.' });
    await company.update(req.body);
    return res.status(200).json(company);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.patch('/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (!company) return res.status(404).json({ detail: 'Company not found.' });
    await company.update(req.body);
    return res.status(200).json(company);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.id);
    if (company) await company.destroy();
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default router;
