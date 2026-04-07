const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const catchAsync = require('../utils/catchAsync');
const config = require('../config');

const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;
  const result = await authService.register({ name, email, password });

  
  ApiResponse.created(res, {
    message: 'Registration successful. Please verify your email.',
    data: { user: result.user, tokens: result.tokens },
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const result = await authService.login({ email, password, ip });

  ApiResponse.success(res, {
    message: 'Login successful',
    data: { user: result.user, tokens: result.tokens },
  });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.user.id);

  ApiResponse.success(res, {
    message: 'Logged out successfully',
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;
  const tokens = await authService.refreshToken(token);

  ApiResponse.success(res, {
    message: 'Token refreshed',
    data: { tokens },
  });
});

const getMe = catchAsync(async (req, res) => {
  const user = await authService.getMe(req.user.id);

  ApiResponse.success(res, {
    data: { user },
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);

  ApiResponse.success(res, {
    message: 'Profile updated successfully',
    data: { user },
  });
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const tokens = await authService.changePassword(req.user.id, {
    currentPassword,
    newPassword,
  });

  ApiResponse.success(res, {
    message: 'Password changed successfully',
    data: { tokens },
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);

  
  // Always return success to prevent email enumeration
  ApiResponse.success(res, {
    message: 'If the email exists, a password reset link has been sent.',
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  await authService.resetPassword(token, password);

  ApiResponse.success(res, {
    message: 'Password reset successful. Please login with your new password.',
  });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.params;
  await authService.verifyEmail(token);

  ApiResponse.success(res, {
    message: 'Email verified successfully',
  });
});

const resendEmailVerification = catchAsync(async (req, res) => {
  const result = await authService.resendEmailVerification(req.user.id);

  
  ApiResponse.success(res, {
    message: 'Verification email sent',
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendEmailVerification,
};
