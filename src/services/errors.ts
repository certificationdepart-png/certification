export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "not_found");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Неавторизовано") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Недостатньо прав доступу") {
    super(message, 403, "forbidden");
  }
}
