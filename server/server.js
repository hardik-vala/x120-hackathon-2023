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

// copied from https://dmitripavlutin.com/timeout-fetch-request/
async function fetchWithTimeout(resource, options = {}) {
    // 8 secs
    const { timeout = 8000 } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
}

app.get('/', async (req, res) => {
    res.status(200).send({
        message: 'Server is running.',
    });
});

app.post('/', async (req, res) => {
    console.log({ req });

    try {
        // e.g. 35162458
        const storyId = req.body.storyId;

        const apiUrl = `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`;
        const response = await fetchWithTimeout(apiUrl)
            .then(response => response.json());

        res.status(200).send({
            message: response,
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({ error });
    }
})

app.listen(5001, () => { console.log('Server is running.') });