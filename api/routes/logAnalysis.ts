import { Router } from 'express';
import { logAnalysisService } from '../services/LogAnalysisService.js';
import { alertService } from '../services/AlertService.js';
import type { AlertThreshold } from '../../shared/types.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.forceRefresh === 'true';
    const result = await logAnalysisService.getAnalysisResult(forceRefresh);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to get analysis result:', error);
    res.status(500).json({ success: false, error: 'Failed to get analysis result' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const status = logAnalysisService.getAnalysisStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Failed to get analysis status:', error);
    res.status(500).json({ success: false, error: 'Failed to get analysis status' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    await logAnalysisService.triggerAnalysis();
    const result = await logAnalysisService.getAnalysisResult(true);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to refresh analysis:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh analysis' });
  }
});

router.get('/alerts/thresholds', async (req, res) => {
  try {
    const thresholds = await alertService.getThresholds();
    res.json({ success: true, data: thresholds });
  } catch (error) {
    console.error('Failed to get thresholds:', error);
    res.status(500).json({ success: false, error: 'Failed to get thresholds' });
  }
});

router.get('/alerts/thresholds/:id', async (req, res) => {
  try {
    const threshold = await alertService.getThreshold(req.params.id);
    if (!threshold) {
      res.status(404).json({ success: false, error: 'Threshold not found' });
      return;
    }
    res.json({ success: true, data: threshold });
  } catch (error) {
    console.error('Failed to get threshold:', error);
    res.status(500).json({ success: false, error: 'Failed to get threshold' });
  }
});

router.post('/alerts/thresholds', async (req, res) => {
  try {
    const data = req.body as Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>;

    if (!data.name || !data.metric || !data.operator || data.threshold === undefined) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const threshold = await alertService.addThreshold(data);
    res.json({ success: true, data: threshold });
  } catch (error) {
    console.error('Failed to add threshold:', error);
    res.status(500).json({ success: false, error: 'Failed to add threshold' });
  }
});

router.put('/alerts/thresholds/:id', async (req, res) => {
  try {
    const data = req.body as Partial<Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>>;
    const threshold = await alertService.updateThreshold(req.params.id, data);
    if (!threshold) {
      res.status(404).json({ success: false, error: 'Threshold not found' });
      return;
    }
    res.json({ success: true, data: threshold });
  } catch (error) {
    console.error('Failed to update threshold:', error);
    res.status(500).json({ success: false, error: 'Failed to update threshold' });
  }
});

router.delete('/alerts/thresholds/:id', async (req, res) => {
  try {
    const deleted = await alertService.deleteThreshold(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Threshold not found' });
      return;
    }
    res.json({ success: true, data: { message: 'Threshold deleted successfully' } });
  } catch (error) {
    console.error('Failed to delete threshold:', error);
    res.status(500).json({ success: false, error: 'Failed to delete threshold' });
  }
});

router.patch('/alerts/thresholds/:id/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) {
      res.status(400).json({ success: false, error: 'Missing enabled field' });
      return;
    }
    const threshold = await alertService.toggleThreshold(req.params.id, enabled);
    if (!threshold) {
      res.status(404).json({ success: false, error: 'Threshold not found' });
      return;
    }
    res.json({ success: true, data: threshold });
  } catch (error) {
    console.error('Failed to toggle threshold:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle threshold' });
  }
});

router.get('/alerts/events', async (req, res) => {
  try {
    const { resolved, severity, thresholdId, limit, offset } = req.query;
    const result = await alertService.getEvents({
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      severity: severity as 'info' | 'warning' | 'critical' | undefined,
      thresholdId: thresholdId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to get events:', error);
    res.status(500).json({ success: false, error: 'Failed to get events' });
  }
});

router.get('/alerts/active', async (req, res) => {
  try {
    const alerts = await alertService.getActiveAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Failed to get active alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to get active alerts' });
  }
});

router.post('/alerts/events/:id/resolve', async (req, res) => {
  try {
    const event = await alertService.resolveEvent(req.params.id);
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Failed to resolve event:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve event' });
  }
});

router.post('/alerts/check', async (req, res) => {
  try {
    const alerts = await alertService.triggerManualCheck();
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Failed to check alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to check alerts' });
  }
});

export default router;
