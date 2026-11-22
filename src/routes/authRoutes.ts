import { Router } from 'express';
import { login, register, sendOtp, verifyOtp } from '../controllers/authController.js';

const router = Router();

// Standard Auth
router.post('/login', login);
router.post('/register', register);

// OTP Email Auth (Sender: contact@theperfumesstory.com)
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

export default router;
