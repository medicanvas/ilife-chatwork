const express = require('express');
const multer = require('multer');
const controller = require('../controllers/carelifeController');
const chatworkSummary = require('../controllers/chatworkSummaryController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// --- 既存: 音声録音 → 通院報告 ---
router.get('/facilities', controller.listFacilities);
router.get('/patients', controller.listPatients);
router.get('/carelife/supplement-questions', controller.getSupplementQuestions);

router.post('/encounters', controller.createEncounter);
router.post('/recordings/sign-upload', controller.signUpload);
router.post('/recordings/:recordingId/finalize', upload.single('audio'), controller.finalizeRecording);

router.get('/carelife/reports/:encounterId', controller.getReport);
router.post('/carelife/send-to-line', controller.sendReportToLine);

// --- 新規: チャットワーク記録 → AI要約 ---
router.post('/chatwork/summary', chatworkSummary.generateSummary);
router.get('/chatwork/rooms', chatworkSummary.listRooms);
router.get('/chatwork/messages', chatworkSummary.listMessages);
router.post('/chatwork/detect-risks', chatworkSummary.detectRisks);
router.get('/chatwork/room-info', chatworkSummary.getRoomInfo);
router.post('/chatwork/send-summary', chatworkSummary.sendSummary);

module.exports = router;
