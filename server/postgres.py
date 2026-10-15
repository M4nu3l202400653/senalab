"""Adaptador de parámetros para las consultas compartidas con SQLite."""
class PostgresConnection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, query, params=()):
        return self.connection.execute(query.replace('?', '%s'), params)
