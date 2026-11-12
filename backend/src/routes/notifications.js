import express from 'express';
import { sendRouteError } from '../utils/routeErrors.js';
import { Notification } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const list = await Notification.findAll({
      where: { recipient_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    return res.status(200).json(list);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

const markReadHandler = async (req, res) => {
  try {
    const notif = await Notification.findOne({
      where: { id: req.params.id, recipient_id: req.user.id }
    });
    if (notif) {
      notif.is_read = true;
      await notif.save();
    }
    return res.status(200).json({ message: 'Marked as read.' });
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
};

router.post('/:id/mark-read/', requireAuth, markReadHandler);
router.post('/:id/read/', requireAuth, markReadHandler);

router.post('/mark-all-read/', requireAuth, async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      { where: { recipient_id: req.user.id } }
    );
    return res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

router.get('/unread-count/', requireAuth, async (req, res) => {
  try {
    const count = await Notification.count({
      where: { recipient_id: req.user.id, is_read: false }
    });
    return res.status(200).json({ count });
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

export default router;
