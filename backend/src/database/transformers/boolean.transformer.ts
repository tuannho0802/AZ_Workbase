import { ValueTransformer } from 'typeorm';

export class BooleanTransformer implements ValueTransformer {
  // Biến đối từ database (number hoặc string) sang boolean của JS
  from(value: any): boolean | null {
    if (value === null || value === undefined) {
      return value;
    }
    return !!value;
  }

  // Biến đổi từ boolean của JS sang giá trị lưu trong database
  to(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    return value;
  }
}
