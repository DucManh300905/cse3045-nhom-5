const express = require('express');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');

const {
    createRestaurant,
    getMyRestaurant,
    updateMyRestaurant
} = require('./restaurant.controller');

const router = express.Router();

router.post(
    '/',
    authenticate,
    authorizeRoles('RESTAURANT_OWNER'),
    createRestaurant
);

router.get(
    '/my-restaurant',
    authenticate,
    authorizeRoles('RESTAURANT_OWNER'),
    getMyRestaurant
);

router.put(
    '/my-restaurant',
    authenticate,
    authorizeRoles('RESTAURANT_OWNER'),
    updateMyRestaurant
);

module.exports = router;