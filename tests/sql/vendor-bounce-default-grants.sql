-- Only in the isolated test database; reproduce observed production defaults.
alter default privileges in schema public grant all on tables to service_role;
