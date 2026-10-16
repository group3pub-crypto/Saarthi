#!/bin/bash
set -e

sed -i 's/scram-sha-256/trust/g' /etc/postgresql/18/main/pg_hba.conf
sed -i 's/md5/trust/g' /etc/postgresql/18/main/pg_hba.conf
su - postgres -c "psql -c \"ALTER ROLE saarthi WITH PASSWORD 'saarthi_dev_pw';\""
service postgresql restart
service redis-server restart
echo "Auth updated and services restarted!"
