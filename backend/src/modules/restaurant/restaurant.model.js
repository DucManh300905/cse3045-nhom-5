const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        address: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'BLOCKED'],
            default: 'PENDING'
        }
    },
    {
        timestamps: true
    }
);

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

module.exports = Restaurant;