export const routes = {
  public: {
    login: "/login",
    signup: "/signup",
  },
  admin: {
    dashboard: "/dashboard",
    schools: "/schools",
    schoolDetail: (id: string) => `/schools/${id}`,
    courses: "/courses",
    applications: "/applications",
    messageTemplates: "/message-templates",
    sync: "/sync",
    applicationDetail: (id: string) => `/applications/${id}`,
  },
} as const;

