import { Role } from '../../../common/enums/role.enum';
import { SelectQueryBuilder, Brackets } from 'typeorm';
import { Customer } from '../../../database/entities/customer.entity';

export class CustomerAccessHelper {
  /**
   * Apply role-based access filter to QueryBuilder (Ownership OR Assignment)
   */
  static applyAccessFilter(
    query: SelectQueryBuilder<any>,
    userId: number,
    userRole: string,
  ): SelectQueryBuilder<any> {
    if (userRole === Role.ADMIN) {
      return query;
    }

    query.andWhere(
      new Brackets((qb) => {
        qb.where('customer.createdById = :userId', { userId })
          .orWhere('customer.salesUserId = :userId', { userId });
      }),
    );

    return query;
  }

  /**
   * Apply access filter with Support for 1:N assignments if joined
   * (If you want to support checking customer_assignments table, you'd need the join,
   * but based on the prompt, checking salesUserId is sufficient for basic ownership/assignment)
   */
  static applyExtendedAccessFilter(
    query: SelectQueryBuilder<any>,
    userId: number,
    userRole: string,
  ): SelectQueryBuilder<any> {
    if (userRole === Role.ADMIN) {
      return query;
    }

    query.andWhere(
      new Brackets((qb) => {
        qb.where('customer.createdById = :userId', { userId })
          .orWhere('customer.salesUserId = :userId', { userId })
          .orWhere(
            'customer.id IN ' +
            '(SELECT ca.customer_id FROM customer_assignments ca ' +
            ' WHERE ca.assigned_to_id = :userId AND ca.status = :status)',
            { userId, status: 'active' }
          );
      }),
    );

    return query;
  }


  /**
   * Check if user has FULL CRUD (Owner or Assignee)
   */
  static canUpdate(
    customer: Customer,
    userId: number,
    userRole: string,
  ): boolean {
    if (userRole === Role.ADMIN) return true;
    return typeof customer.createdById === 'number' && customer.createdById === userId
      || typeof customer.salesUserId === 'number' && customer.salesUserId === userId;
  }

  /**
   * Check if user is the STRICT OWNER (or Admin) to allow Delete
   */
  static canDelete(
    customer: Customer,
    userId: number,
    userRole: string,
  ): boolean {
    if (userRole === Role.ADMIN) return true;
    return typeof customer.createdById === 'number' && customer.createdById === userId;
  }
}
