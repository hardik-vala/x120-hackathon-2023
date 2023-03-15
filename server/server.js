import textToSpeech from '@google-cloud/text-to-speech';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';
import { Configuration, OpenAIApi } from 'openai';
import util from 'util';

dotenv.config();

const MAX_TOKENS = 500;

const configuration = new Configuration({
    organization: process.env.OPENAI_API_ORG,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const textToSpeechClient = new textToSpeech.TextToSpeechClient();

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

function fetchHackerNewsItemsContents(itemId) {
    const itemContents = {};
    const apiUrl = `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`;
    return fetch(apiUrl)
        .then(response => response.json())
        .then(async (data) => {
            itemContents.id = data.id;
            itemContents.by = data.by;
            itemContents.kidIds = data.kids;
            itemContents.title = data.title;
            itemContents.text = data.text;
            itemContents.url = data.url;
            if (itemContents.kidIds) {
                const kidsPromises = itemContents.kidIds.map(kidId => {
                    return fetchHackerNewsItemsContents(kidId);
                });
                itemContents.kidContents = await Promise.all(kidsPromises).then(kids => {
                    const kidContents = {}; 
                    kids.forEach(k => kidContents[k.id] = k);
                    return kidContents;
                });
            }
            return itemContents;
        }).catch(error => error);
}

function getStoryTextConcatenated(story) {
    let mergedText = story.text || '';
    if (story.kidIds) {
        for (let i = 0; i < story.kidIds.length; i++) {
            mergedText += ' ' + getStoryTextConcatenated(story.kidContents[story.kidIds[i]]);
        }
    }
    return mergedText;
}

function flattenStory(story) {
    let flattenedStory = [];
    if (story.text) {
        flattenedStory.push({by: story.by, text: story.text});
    }
    if (story.kidIds) {
        for (let i = 0; i < story.kidIds.length; i++) {
            flattenedStory = flattenedStory.concat(flattenStory(story.kidContents[story.kidIds[i]]));
        }
    }
    return flattenedStory;
}

app.get('/', async (req, res) => {
    res.status(200).send({
        message: 'Server is running.',
    });
});

app.get('/story/contents/tree/:storyId', async (req, res) => {
    console.log({ req });

    try {
        // e.g. 35162458
        const storyId = req.params.storyId;
        const story = await fetchHackerNewsItemsContents(storyId);

        // const mergedText = getStoryTextConcatenated(story);
        // const prompt = `Summarize the most important points in the following text: "${mergedText}"`
        // const summary = await openai.createCompletion({
        //     model: "text-davinci-003",
        //     prompt: `${prompt}\n\n`,
        //     temperature: 0.2,
        //     max_tokens: MAX_TOKENS,
        //     top_p: 1,
        //     frequency_penalty: 0,
        //     presence_penalty: 0,
        // });
        // const summaryText = summary.data.choices[0].text;

        res.status(200).send({
            story: story,
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({ error });
    }
});

app.get('/story/contents/flat/:storyId', async (req, res) => {
    console.log({ req });

    try {
        // e.g. 35162458
        const storyId = req.params.storyId;
        const story = await fetchHackerNewsItemsContents(storyId);
        const flattenedStory = flattenStory(story);
        
        res.status(200).send({ flattenedStory });
    } catch (error) {
        console.log(error);
        res.status(500).send({ error });
    }
});

app.post('/', async (req, res) => {
    console.log({ req });

    try {
        // e.g. 35162458
        const storyId = req.body.storyId;
        const story = await fetchHackerNewsItemsContents(storyId);
        const flattenedStory = flattenStory(story);

        // const s = flattenedStoryText.substring(0, 100);
        // const textToSpeechReq = {
        //     input: {text: s},
        //     voice: {languageCode: 'en-US', name: 'en-US-Wavenet-D', ssmlGender: 'MALE'},
        //     audioConfig: {audioEncoding: 'MP3'},
        // };

        // const [response] = await textToSpeechClient.synthesizeSpeech(textToSpeechReq);
        // // Write the binary audio content to a local file
        // const writeFile = util.promisify(fs.writeFile);
        // await writeFile('output1.mp3', response.audioContent, 'binary');
        // console.log('Audio content written to file: output1.mp3');

        // const s2 = flattenedStoryText.substring(100, 200);
        // const textToSpeechReq2 = {
        //     input: {text: s2},
        //     voice: {languageCode: 'en-US', name: 'en-US-Wavenet-E', ssmlGender: 'FEMALE'},
        //     audioConfig: {audioEncoding: 'MP3'},
        // };
        // const [response2] = await textToSpeechClient.synthesizeSpeech(textToSpeechReq2);
        // const writeFile2 = util.promisify(fs.writeFile);
        // await writeFile2('output2.mp3', response2.audioContent, 'binary');
        // console.log('Audio content written to file: output2.mp3');

        // const mergedText = getStoryTextConcatenated(story);
        // const prompt = `Summarize the most important points in the following text: "${mergedText}"`
        // const summary = await openai.createCompletion({
        //     model: "text-davinci-003",
        //     prompt: `${prompt}\n\n`,
        //     temperature: 0.2,
        //     max_tokens: MAX_TOKENS,
        //     top_p: 1,
        //     frequency_penalty: 0,
        //     presence_penalty: 0,
        // });
        // const summaryText = summary.data.choices[0].text;

        res.status(200).send({
            story: story,
            flattenedStory: flattenedStory,
            // summary: summaryText,
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({ error });
    }
})

app.listen(5001, () => { console.log('Server is running.') });