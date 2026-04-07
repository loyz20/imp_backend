class ApiResponse {
  static success(res, { statusCode = 200, message = 'Success', data = null, meta = null }) {
    const response = { success: true, message };
    if (data !== null) response.data = data;
    if (meta !== null) response.meta = meta;
    return res.status(statusCode).json(response);
  }

  static created(res, { message = 'Created successfully', data = null }) {
    return ApiResponse.success(res, { statusCode: 201, message, data });
  }

  static error(res, { statusCode = 500, message = 'Internal server error', errors = [] }) {
    const response = { success: false, message };
    if (errors.length > 0) response.errors = errors;
    return res.status(statusCode).json(response);
  }
}

module.exports = ApiResponse;
