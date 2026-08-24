import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { isFutureDateVn } from '../utils/date-vn.util';

@ValidatorConstraint({ async: false })
export class IsNotFutureDateVnConstraint implements ValidatorConstraintInterface {
  validate(date: any, args: ValidationArguments) {
    if (!date) return true; // Let @IsNotEmpty or @IsDate handle missing/invalid types if needed
    return !isFutureDateVn(date);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must not be a future date (Vietnam Time).`;
  }
}

export function IsNotFutureDateVn(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotFutureDateVnConstraint,
    });
  };
}
