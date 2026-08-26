import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateZkDeviceUserCache1777600000000
  implements MigrationInterface
{
  name = 'CreateZkDeviceUserCache1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('zk_device_user_cache');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`zk_device_user_cache\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`device_serial_number\` varchar(50) NOT NULL,
          \`device_user_id\` varchar(50) NOT NULL,
          \`name\` varchar(100) NOT NULL,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_zk_device_user_cache\` (\`device_serial_number\`, \`device_user_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('zk_device_user_cache');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE \`zk_device_user_cache\`;`);
    }
  }
}
