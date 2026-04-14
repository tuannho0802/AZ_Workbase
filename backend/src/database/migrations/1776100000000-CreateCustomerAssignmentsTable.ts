import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateCustomerAssignmentsTable1776100000000 implements MigrationInterface {
  name = 'CreateCustomerAssignmentsTable1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customer_assignments',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'customer_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'assigned_by_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'assigned_to_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'previous_assignee_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'transferred', 'reclaimed'],
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'assigned_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'reclaimed_at',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'reclaimed_by_id',
            type: 'int',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Indexes
    await queryRunner.createIndex(
      'customer_assignments',
      new TableIndex({ name: 'idx_ca_customer', columnNames: ['customer_id'] }),
    );
    await queryRunner.createIndex(
      'customer_assignments',
      new TableIndex({ name: 'idx_ca_assigned_to', columnNames: ['assigned_to_id'] }),
    );
    await queryRunner.createIndex(
      'customer_assignments',
      new TableIndex({ name: 'idx_ca_assigned_by', columnNames: ['assigned_by_id'] }),
    );
    await queryRunner.createIndex(
      'customer_assignments',
      new TableIndex({ name: 'idx_ca_status', columnNames: ['status'] }),
    );

    // Foreign Keys
    await queryRunner.createForeignKey(
      'customer_assignments',
      new TableForeignKey({
        name: 'fk_ca_customer',
        columnNames: ['customer_id'],
        referencedTableName: 'customers',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'customer_assignments',
      new TableForeignKey({
        name: 'fk_ca_assigned_by',
        columnNames: ['assigned_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
    );
    await queryRunner.createForeignKey(
      'customer_assignments',
      new TableForeignKey({
        name: 'fk_ca_assigned_to',
        columnNames: ['assigned_to_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
    );
    await queryRunner.createForeignKey(
      'customer_assignments',
      new TableForeignKey({
        name: 'fk_ca_previous_assignee',
        columnNames: ['previous_assignee_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await queryRunner.createForeignKey(
      'customer_assignments',
      new TableForeignKey({
        name: 'fk_ca_reclaimed_by',
        columnNames: ['reclaimed_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('customer_assignments', true);
  }
}
