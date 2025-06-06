const request = require('supertest');

jest.mock('pg', () => {
    const mClient = { query: jest.fn() };
    return { Pool: jest.fn(() => mClient) };
});

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        ping: jest.fn(),
        del: jest.fn()
    }));
});

const app = require('../../app');

describe('Proste testy aplikacji', () => {
    let pgPoolMock;
    let redisMock;

    beforeAll(() => {
        const { Pool } = require('pg');
        pgPoolMock = new Pool();
        const Redis = require('ioredis');
        redisMock = new Redis();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('GET /health → 200 gdy PostgreSQL i Redis działają', async () => {
        pgPoolMock.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        redisMock.ping.mockResolvedValueOnce('PONG');

        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            status: 'OK',
            postgres: 'reachable',
            redis: 'reachable'
        });
        expect(pgPoolMock.query).toHaveBeenCalledWith('SELECT 1');
        expect(redisMock.ping).toHaveBeenCalled();
    });

    it('GET /items → zwraca dane z bazy, gdy cache pusty', async () => {
        // Redis.get zwraca null (cache miss)
        redisMock.get.mockResolvedValueOnce(null);
        // Baza zwraca dwa wiersze
        const fakeRows = [
            { id: 1, name: 'A', description: 'desc A', created_at: '2025-01-01T00:00:00Z' },
            { id: 2, name: 'B', description: 'desc B', created_at: '2025-02-02T00:00:00Z' }
        ];
        pgPoolMock.query.mockResolvedValueOnce({ rows: fakeRows });
        redisMock.set.mockResolvedValueOnce('OK');

        const res = await request(app).get('/items');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(fakeRows);
        expect(redisMock.get).toHaveBeenCalledWith('items:all');
        expect(pgPoolMock.query).toHaveBeenCalledWith(
            'SELECT id, name, description, created_at FROM items ORDER BY created_at DESC'
        );
        expect(redisMock.set).toHaveBeenCalledWith(
            'items:all',
            JSON.stringify(fakeRows),
            'EX',
            30
        );
    });
});
