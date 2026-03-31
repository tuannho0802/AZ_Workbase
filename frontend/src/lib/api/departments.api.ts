import axiosInstance from './axios-instance';

/**
 * API for managing departments
 */
export const departmentsApi = {
  getDepartments: async () => {
    const response = await axiosInstance.get('/departments');
    return response.data;
  },
};
