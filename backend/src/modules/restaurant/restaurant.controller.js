const Restaurant = require('./restaurant.model');

const createRestaurant = async (req, res) => {
    try {
        const { name, description, address, phone } = req.body;

        if (!name || !address || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Name, address and phone are required'
            });
        }

        const existingRestaurant = await Restaurant.findOne({
            owner: req.user.userId
        });

        if (existingRestaurant) {
            return res.status(409).json({
                success: false,
                message: 'You already have a restaurant'
            });
        }

        const restaurant = await Restaurant.create({
            name,
            description,
            address,
            phone,
            owner: req.user.userId
        });

        return res.status(201).json({
            success: true,
            message: 'Restaurant created successfully',
            data: restaurant
        });
    } catch (error) {
        console.error('Create restaurant error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};


const getMyRestaurant = async (req, res) => {
    try {
        const restaurant = await Restaurant.findOne({
            owner: req.user.userId
        });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message: 'Restaurant not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: restaurant
        });
    } catch (error) {
        console.error('Get my restaurant error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

const updateMyRestaurant = async (req, res) => {
    try {
        const { name, description, address, phone } = req.body;

        const restaurant = await Restaurant.findOne({
            owner: req.user.userId
        });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message: 'Restaurant not found'
            });
        }

        if (name !== undefined) {
            restaurant.name = name;
        }

        if (description !== undefined) {
            restaurant.description = description;
        }

        if (address !== undefined) {
            restaurant.address = address;
        }

        if (phone !== undefined) {
            restaurant.phone = phone;
        }

        await restaurant.save();

        return res.status(200).json({
            success: true,
            message: 'Restaurant updated successfully',
            data: restaurant
        });
    } catch (error) {
        console.error('Update restaurant error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    createRestaurant,
    getMyRestaurant,
    updateMyRestaurant
};