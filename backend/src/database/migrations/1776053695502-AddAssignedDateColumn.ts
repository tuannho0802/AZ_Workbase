import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssignedDateColumn1776053695502 implements MigrationInterface {
    name = 'AddAssignedDateColumn1776053695502'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` ON \`customers\``);
        await queryRunner.query(`ALTER TABLE \`customers\` CHANGE \`phone\` \`phone\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD UNIQUE INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` (\`phone\`)`);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`name\` \`name\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`departments\` ADD UNIQUE INDEX \`IDX_8681da666ad9699d568b3e9106\` (\`name\`)`);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`manager_user_id\` \`manager_user_id\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`is_active\` \`is_active\` tinyint NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE \`departments\` DROP COLUMN \`created_at\``);
        await queryRunner.query(`ALTER TABLE \`departments\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`departments\` DROP COLUMN \`updated_at\``);
        await queryRunner.query(`ALTER TABLE \`departments\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`email\` \`email\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a8fcf679692db1c886e7f15d2b\` ON \`customers\` (\`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_56f5b58b95fd5d95aafee78961\` ON \`customers\` (\`assigned_date\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_0bb735ba5c0669861a628e2a13\` ON \`customers\` (\`input_date\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_ec557e8bb128bcd674bf092244\` ON \`customers\` (\`source\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_589e5e6434f0e8628aa2ad33e1\` ON \`customers\` (\`status\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_b942d55b92ededa770041db9de\` ON \`customers\` (\`name\`)`);
        await queryRunner.query(`ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_754dce45ed0184363d44fd12493\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_d58c9a2e2e6433613026ffd84ca\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_b0194064978f71db636787670c4\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customer_notes\` ADD CONSTRAINT \`FK_b77784184daa7589018ac4e8402\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customer_notes\` ADD CONSTRAINT \`FK_787c3b37dc8687657c7fb66d78a\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_227898340ac01eedd3a384d6474\` FOREIGN KEY (\`sales_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_ac3d43d09dbba144ccf2036284c\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_8f138f284609b045dc64c91757a\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_78c73bbdc2a390834b9a0136a43\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_dd30e19871832f822492bbc6296\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_0921d1972cf861d568f5271cd85\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_0921d1972cf861d568f5271cd85\``);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_dd30e19871832f822492bbc6296\``);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_78c73bbdc2a390834b9a0136a43\``);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_8f138f284609b045dc64c91757a\``);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_ac3d43d09dbba144ccf2036284c\``);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_227898340ac01eedd3a384d6474\``);
        await queryRunner.query(`ALTER TABLE \`customer_notes\` DROP FOREIGN KEY \`FK_787c3b37dc8687657c7fb66d78a\``);
        await queryRunner.query(`ALTER TABLE \`customer_notes\` DROP FOREIGN KEY \`FK_b77784184daa7589018ac4e8402\``);
        await queryRunner.query(`ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_b0194064978f71db636787670c4\``);
        await queryRunner.query(`ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_d58c9a2e2e6433613026ffd84ca\``);
        await queryRunner.query(`ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_754dce45ed0184363d44fd12493\``);
        await queryRunner.query(`DROP INDEX \`IDX_b942d55b92ededa770041db9de\` ON \`customers\``);
        await queryRunner.query(`DROP INDEX \`IDX_589e5e6434f0e8628aa2ad33e1\` ON \`customers\``);
        await queryRunner.query(`DROP INDEX \`IDX_ec557e8bb128bcd674bf092244\` ON \`customers\``);
        await queryRunner.query(`DROP INDEX \`IDX_0bb735ba5c0669861a628e2a13\` ON \`customers\``);
        await queryRunner.query(`DROP INDEX \`IDX_56f5b58b95fd5d95aafee78961\` ON \`customers\``);
        await queryRunner.query(`DROP INDEX \`IDX_a8fcf679692db1c886e7f15d2b\` ON \`customers\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\``);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`email\` \`email\` varchar(255) COLLATE "utf8mb4_unicode_ci" NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`departments\` DROP COLUMN \`updated_at\``);
        await queryRunner.query(`ALTER TABLE \`departments\` ADD \`updated_at\` timestamp(0) NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`departments\` DROP COLUMN \`created_at\``);
        await queryRunner.query(`ALTER TABLE \`departments\` ADD \`created_at\` timestamp(0) NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`is_active\` \`is_active\` tinyint NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`manager_user_id\` \`manager_user_id\` int NULL COMMENT 'Department manager'`);
        await queryRunner.query(`ALTER TABLE \`departments\` DROP INDEX \`IDX_8681da666ad9699d568b3e9106\``);
        await queryRunner.query(`ALTER TABLE \`departments\` CHANGE \`name\` \`name\` varchar(255) COLLATE "utf8mb4_unicode_ci" NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`customers\` DROP INDEX \`IDX_88acd889fbe17d0e16cc4bc917\``);
        await queryRunner.query(`ALTER TABLE \`customers\` CHANGE \`phone\` \`phone\` varchar(20) COLLATE "utf8mb4_unicode_ci" NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` ON \`customers\` (\`phone\`)`);
    }

}
