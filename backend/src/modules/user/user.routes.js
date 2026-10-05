const express = require('express');

const { authenticate } = require('../../middlewares/auth.middleware');
const {
    getMyProfile,
    updateMyProfile
} = require('./user.controller');

const router = express.Router();

router.get('/me', authenticate, getMyProfile);

router.put('/me', authenticate, updateMyProfile);

module.exports = router;