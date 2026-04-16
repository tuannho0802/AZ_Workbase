import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

export class DuplicatePhoneException extends BadRequestException {
  constructor() {
    super('Số điện thoại đã tồn tại');
  }
}

export class CustomerNotFoundException extends NotFoundException {
  constructor() {
    super('Không tìm thấy khách hàng này');
  }
}

export class UnauthorizedCustomerAccessException extends ForbiddenException {
  constructor(message?: string) {
    super(message || 'Bạn không có quyền truy cập dữ liệu của khách hàng này');
  }
}
