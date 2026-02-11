const { Staff, Service, StaffService } = require('../models');

// GET /api/staff
exports.listStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findAll({
      include: [{ model: Service, through: { attributes: [] } }],
      order: [['name', 'ASC']],
    });
    res.json(staff);
  } catch (err) {
    next(err);
  }
};

// GET /api/staff/:id
exports.getStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findByPk(req.params.id, {
      include: [{ model: Service, through: { attributes: [] } }],
    });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    next(err);
  }
};

// POST /api/staff
exports.createStaff = async (req, res, next) => {
  try {
    const { name, bio, specialization, email, phone, serviceIds } = req.body;
    const staff = await Staff.create({
      name,
      bio,
      specialization,
      email,
      phone,
    });

    if (serviceIds && Array.isArray(serviceIds)) {
      const services = await Service.findAll({ where: { id: serviceIds } });
      await staff.setServices(services);
    }

    const staffWithServices = await Staff.findByPk(staff.id, {
      include: [{ model: Service, through: { attributes: [] } }],
    });

    res.status(201).json(staffWithServices);
  } catch (err) {
    next(err);
  }
};

// PUT /api/staff/:id
exports.updateStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const { name, bio, specialization, email, phone, serviceIds, isActive } = req.body;

    await staff.update({
      name: name !== undefined ? name : staff.name,
      bio: bio !== undefined ? bio : staff.bio,
      specialization: specialization !== undefined ? specialization : staff.specialization,
      email: email !== undefined ? email : staff.email,
      phone: phone !== undefined ? phone : staff.phone,
      isActive: isActive !== undefined ? isActive : staff.isActive,
    });

    if (serviceIds && Array.isArray(serviceIds)) {
      const services = await Service.findAll({ where: { id: serviceIds } });
      await staff.setServices(services);
    }

    const staffWithServices = await Staff.findByPk(staff.id, {
      include: [{ model: Service, through: { attributes: [] } }],
    });

    res.json(staffWithServices);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/staff/:id
exports.deleteStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    await staff.update({ isActive: false });
    res.json({ message: 'Staff deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
