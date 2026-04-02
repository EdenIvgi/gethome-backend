import { Router } from 'express';
import { startScan, getStatus } from '../tasks/scanManager.js';

const router = Router();

router.post('/', (req, res) => {
  const result = startScan();
  if (result.started) {
    res.status(202).json({ status: 'scanning', message: result.message });
  } else {
    res.status(409).json({ status: 'scanning', message: result.message });
  }
});

router.get('/status', (req, res) => {
  res.json(getStatus());
});

export default router;
