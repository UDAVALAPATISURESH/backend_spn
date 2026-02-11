const { Service, Staff } = require('../models');

// GET /api/services
exports.listServices = async (req, res, next) => {
  try {
    const services = await Service.findAll({
      where: { isActive: true },
      include: [{ model: Staff, through: { attributes: [] } }],
      order: [['name', 'ASC']],
    });
    res.json(services);
  } catch (err) {
    next(err);
  }
};

// GET /api/services/:id
exports.getService = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id, {
      include: [{ model: Staff, through: { attributes: [] } }],
    });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) {
    next(err);
  }
};

// POST /api/services
exports.createService = async (req, res, next) => {
  try {
    const { name, description, durationMinutes, price, staffIds } = req.body;

    if (!name || !durationMinutes || price === undefined) {
      return res.status(400).json({ message: 'name, durationMinutes, and price are required' });
    }

    const service = await Service.create({
      name,
      description,
      durationMinutes,
      price,
    });

    if (staffIds && Array.isArray(staffIds)) {
      const staff = await Staff.findAll({ where: { id: staffIds } });
      // belongsToMany generates setStaffs accessor
      await service.setStaffs(staff);
    }

    const serviceWithStaff = await Service.findByPk(service.id, {
      include: [{ model: Staff, through: { attributes: [] } }],
    });

    res.status(201).json(serviceWithStaff);
  } catch (err) {
    next(err);
  }
};

// PUT /api/services/:id
exports.updateService = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const { name, description, durationMinutes, price, staffIds, isActive } = req.body;

    await service.update({
      name: name !== undefined ? name : service.name,
      description: description !== undefined ? description : service.description,
      durationMinutes: durationMinutes !== undefined ? durationMinutes : service.durationMinutes,
      price: price !== undefined ? price : service.price,
      isActive: isActive !== undefined ? isActive : service.isActive,
    });

    if (staffIds && Array.isArray(staffIds)) {
      const staff = await Staff.findAll({ where: { id: staffIds } });
      await service.setStaffs(staff);
    }

    const serviceWithStaff = await Service.findByPk(service.id, {
      include: [{ model: Staff, through: { attributes: [] } }],
    });

    res.json(serviceWithStaff);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/services/:id
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    await service.update({ isActive: false });
    res.json({ message: 'Service deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
