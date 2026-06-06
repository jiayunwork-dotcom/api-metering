import crypto from 'crypto';
import { User } from '../models/index.js';

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;

    const user = await User.findOne({
      where: { username, status: 'active' },
    });

    if (!user) {
      return reply.status(401).send({
        success: false,
        message: '用户名或密码错误',
      });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    if (passwordHash !== user.password) {
      return reply.status(401).send({
        success: false,
        message: '用户名或密码错误',
      });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  });

  fastify.get('/api/auth/me', { onRequest: [fastify.authenticate] }, async (request) => {
    const user = await User.findByPk(request.user.id, {
      attributes: ['id', 'username', 'name', 'email', 'role'],
    });

    return {
      success: true,
      user,
    };
  });

  fastify.post('/api/auth/change-password', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body;

    const user = await User.findByPk(request.user.id);
    if (!user) {
      return reply.status(404).send({ success: false, message: '用户不存在' });
    }

    const oldPasswordHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
    if (oldPasswordHash !== user.password) {
      return reply.status(400).send({ success: false, message: '原密码错误' });
    }

    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    user.password = newPasswordHash;
    await user.save();

    return { success: true, message: '密码修改成功' };
  });
}
