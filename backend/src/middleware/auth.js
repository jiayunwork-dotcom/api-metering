import { verifyApiKey, updateLastUsedTime, incrementQuotaUsage, logAccess } from '../services/apiKeyService.js';

function getClientIp(request) {
  const xForwardedFor = request.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export function createUnifiedAuth(fastify, resource = null, action = null) {
  return async (request, reply) => {
    const apiKeyHeader = request.headers['x-api-key'];
    const authHeader = request.headers['authorization'];

    if (apiKeyHeader && authHeader) {
      return reply.status(400).send({
        success: false,
        message: 'X-API-Key 和 Authorization 不能同时使用',
      });
    }

    const ipAddress = getClientIp(request);
    const metadata = {
      userAgent: request.headers['user-agent'],
      requestPath: request.routerPath || request.url,
      requestMethod: request.method,
    };

    if (apiKeyHeader) {
      const verifyResult = await verifyApiKey(apiKeyHeader, ipAddress, resource, action);

      if (!verifyResult.valid) {
        const statusCode = verifyResult.reason === 'permission_denied' || verifyResult.reason === 'ip_denied' || verifyResult.reason === 'quota_exceeded'
          ? 403
          : 401;

        return reply.status(statusCode).send({
          success: false,
          message: verifyResult.message,
          reason: verifyResult.reason,
        });
      }

      const apiKey = verifyResult.apiKey;
      request.apiKey = apiKey;
      request.tenantId = apiKey.tenantId;
      request.authType = 'api_key';

      request.user = {
        id: null,
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.id,
        role: 'api_key',
      };

      await updateLastUsedTime(apiKey.id);

      if (apiKey.quotaLimit !== null && apiKey.quotaLimit > 0) {
        await incrementQuotaUsage(apiKey.id, 1);
      }

      await logAccess(
        apiKey.id,
        apiKey.tenantId,
        apiKey.keyPrefix,
        'success',
        ipAddress,
        resource,
        action,
        null,
        metadata
      );

      return;
    }

    try {
      await request.jwtVerify();
      request.authType = 'jwt';

      if (resource && action) {
        request.user.tenantId = request.user.tenantId;
      }
    } catch (err) {
      return reply.status(401).send({
        success: false,
        message: '未授权访问',
      });
    }
  };
}

export function requirePermission(resource, action) {
  return async (request, reply) => {
    if (request.authType === 'api_key') {
      const apiKey = request.apiKey;
      const hasPermission = apiKey.permissions?.some(
        p => p.resource === resource && p.action === action
      );
      if (!hasPermission) {
        return reply.status(403).send({
          success: false,
          message: '权限不足',
        });
      }
    }
  };
}

export function createAuthMiddleware(fastify) {
  return {
    authenticate: async (request, reply) => {
      const apiKeyHeader = request.headers['x-api-key'];
      const authHeader = request.headers['authorization'];

      if (apiKeyHeader && authHeader) {
        return reply.status(400).send({
          success: false,
          message: 'X-API-Key 和 Authorization 不能同时使用',
        });
      }

      if (apiKeyHeader) {
        const ipAddress = getClientIp(request);
        const verifyResult = await verifyApiKey(apiKeyHeader, ipAddress);

        if (!verifyResult.valid) {
          const statusCode = verifyResult.reason === 'permission_denied' || verifyResult.reason === 'ip_denied' || verifyResult.reason === 'quota_exceeded'
            ? 403
            : 401;

          return reply.status(statusCode).send({
            success: false,
            message: verifyResult.message,
            reason: verifyResult.reason,
          });
        }

        const apiKey = verifyResult.apiKey;
        request.apiKey = apiKey;
        request.tenantId = apiKey.tenantId;
        request.authType = 'api_key';

        request.user = {
          id: null,
          tenantId: apiKey.tenantId,
          apiKeyId: apiKey.id,
          role: 'api_key',
        };

        await updateLastUsedTime(apiKey.id);
      }

      if (authHeader) {
        try {
          await request.jwtVerify();
          request.authType = 'jwt';
        } catch (err) {
          return reply.status(401).send({
            success: false,
            message: '未授权访问',
          });
        }
      }
    },

    withPermission: (resource, action) => {
      return [
        async (request, reply) => {
          const apiKeyHeader = request.headers['x-api-key'];
          const authHeader = request.headers['authorization'];

          if (apiKeyHeader && authHeader) {
            return reply.status(400).send({
              success: false,
              message: 'X-API-Key 和 Authorization 不能同时使用',
            });
          }

          const ipAddress = getClientIp(request);
          const metadata = {
            userAgent: request.headers['user-agent'],
            requestPath: request.routerPath || request.url,
            requestMethod: request.method,
          };

          if (apiKeyHeader) {
            const verifyResult = await verifyApiKey(apiKeyHeader, ipAddress, resource, action);

            if (!verifyResult.valid) {
              const statusCode = verifyResult.reason === 'permission_denied' || verifyResult.reason === 'ip_denied' || verifyResult.reason === 'quota_exceeded'
                ? 403
                : 401;

              return reply.status(statusCode).send({
                success: false,
                message: verifyResult.message,
                reason: verifyResult.reason,
              });
            }

            const apiKey = verifyResult.apiKey;
            request.apiKey = apiKey;
            request.tenantId = apiKey.tenantId;
            request.authType = 'api_key';

            request.user = {
              id: null,
              tenantId: apiKey.tenantId,
              apiKeyId: apiKey.id,
              role: 'api_key',
            };

            await updateLastUsedTime(apiKey.id);

            if (apiKey.quotaLimit !== null && apiKey.quotaLimit > 0) {
              await incrementQuotaUsage(apiKey.id, 1);
            }

            await logAccess(
              apiKey.id,
              apiKey.tenantId,
              apiKey.keyPrefix,
              'success',
              ipAddress,
              resource,
              action,
              null,
              metadata
            );

            return;
          }

          try {
            await request.jwtVerify();
            request.authType = 'jwt';
          } catch (err) {
            return reply.status(401).send({
              success: false,
              message: '未授权访问',
            });
          }
        }
      ];
    },
  };
}

export default {
  createUnifiedAuth,
  requirePermission,
  createAuthMiddleware,
  getClientIp,
};
