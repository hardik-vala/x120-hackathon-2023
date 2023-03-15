import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import { Configuration, OpenAIApi } from 'openai';

dotenv.config();

const MAX_TOKENS = 500;

const configuration = new Configuration({
    organization: process.env.OPENAI_API_ORG,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', async (req, res) => {
    res.status(200).send({
        message: 'Server is running.',
    })
});

app.listen(5001, () => { console.log('Server is running.') });