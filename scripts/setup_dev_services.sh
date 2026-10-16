#!/bin/bash
set -e

service postgresql start
service redis-server start

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname = 'saarthi'\" | grep -q 1 || psql -c \"CREATE ROLE saarthi WITH SUPERUSER LOGIN PASSWORD 'saarthi_dev_pw';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'saarthi_db'\" | grep -q 1 || psql -c \"CREATE DATABASE saarthi_db OWNER saarthi;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'saarthi_test_db'\" | grep -q 1 || psql -c \"CREATE DATABASE saarthi_test_db OWNER saarthi;\""

su - postgres -c "psql -d saarthi_db -c 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting; CREATE EXTENSION IF NOT EXISTS pg_trgm;'"
su - postgres -c "psql -d saarthi_test_db -c 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting; CREATE EXTENSION IF NOT EXISTS pg_trgm;'"

grep -q "host all all 0.0.0.0/0 md5" /etc/postgresql/18/main/pg_hba.conf || echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/18/main/pg_hba.conf
grep -q "listen_addresses = '\*'" /etc/postgresql/18/main/postgresql.conf || echo "listen_addresses = '*'" >> /etc/postgresql/18/main/postgresql.conf

service postgresql restart
service redis-server restart
echo "PostgreSQL and Redis successfully configured!"
