import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from "typeorm";

export class AddAuditFieldsToCustomerAndDeposit1775457002753 implements MigrationInterface {
    name = 'AddAuditFieldsToCustomerAndDeposit1775457002753'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // customers table
        const customersTable = await queryRunner.getTable("customers");
        if (customersTable) {
            if (!customersTable.findColumnByName("created_by_id")) {
                await queryRunner.addColumn("customers", new TableColumn({
                    name: "created_by_id",
                    type: "int",
                    isNullable: true
                }));
            }
            if (!customersTable.findColumnByName("updated_by_id")) {
                await queryRunner.addColumn("customers", new TableColumn({
                    name: "updated_by_id",
                    type: "int",
                    isNullable: true
                }));
            }
            
            // Re-fetch to ensure we have columns for FK check
            const updatedCustomersTable = await queryRunner.getTable("customers");
            if (updatedCustomersTable && !updatedCustomersTable.foreignKeys.some(fk => fk.name === "FK_customers_created_by")) {
                await queryRunner.createForeignKey("customers", new TableForeignKey({
                    name: "FK_customers_created_by",
                    columnNames: ["created_by_id"],
                    referencedColumnNames: ["id"],
                    referencedTableName: "users",
                    onDelete: "SET NULL"
                }));
            }
            if (updatedCustomersTable && !updatedCustomersTable.foreignKeys.some(fk => fk.name === "FK_customers_updated_by")) {
                await queryRunner.createForeignKey("customers", new TableForeignKey({
                    name: "FK_customers_updated_by",
                    columnNames: ["updated_by_id"],
                    referencedColumnNames: ["id"],
                    referencedTableName: "users",
                    onDelete: "SET NULL"
                }));
            }
        }

        // deposits table
        const depositsTable = await queryRunner.getTable("deposits");
        if (depositsTable) {
            if (!depositsTable.findColumnByName("created_by_id")) {
                await queryRunner.addColumn("deposits", new TableColumn({
                    name: "created_by_id",
                    type: "int",
                    isNullable: true
                }));
            }
            
            const updatedDepositsTable = await queryRunner.getTable("deposits");
            if (updatedDepositsTable && !updatedDepositsTable.foreignKeys.some(fk => fk.name === "FK_deposits_created_by")) {
                await queryRunner.createForeignKey("deposits", new TableForeignKey({
                    name: "FK_deposits_created_by",
                    columnNames: ["created_by_id"],
                    referencedColumnNames: ["id"],
                    referencedTableName: "users",
                    onDelete: "SET NULL"
                }));
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys if they exist
        const depositsTable = await queryRunner.getTable("deposits");
        if (depositsTable && depositsTable.foreignKeys.some(fk => fk.name === "FK_deposits_created_by")) {
            await queryRunner.dropForeignKey("deposits", "FK_deposits_created_by");
        }

        const customersTable = await queryRunner.getTable("customers");
        if (customersTable) {
            if (customersTable.foreignKeys.some(fk => fk.name === "FK_customers_updated_by")) {
                await queryRunner.dropForeignKey("customers", "FK_customers_updated_by");
            }
            if (customersTable.foreignKeys.some(fk => fk.name === "FK_customers_created_by")) {
                await queryRunner.dropForeignKey("customers", "FK_customers_created_by");
            }
        }

        // Drop columns if they exist
        if (depositsTable && depositsTable.findColumnByName("created_by_id")) {
            await queryRunner.dropColumn("deposits", "created_by_id");
        }
        if (customersTable) {
            if (customersTable.findColumnByName("updated_by_id")) {
                await queryRunner.dropColumn("customers", "updated_by_id");
            }
            if (customersTable.findColumnByName("created_by_id")) {
                await queryRunner.dropColumn("customers", "created_by_id");
            }
        }
    }
}
