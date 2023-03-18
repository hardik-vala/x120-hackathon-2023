import textToSpeech from '@google-cloud/text-to-speech';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express, { text } from 'express';
import fs from 'fs';
import { decode } from 'html-entities';
import fetch from 'node-fetch';
import { Configuration, OpenAIApi } from 'openai';
import util from 'util';

dotenv.config();

const MAX_PROMPT_LEN = 4000;
const MAX_OUT_TOKENS = 1000;

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

function getPrompt(style) {
    if (style === 'bullet-points') {
        return 'Extract from this forum discussion a list of the top 10 most valuable insights, data points and web links. Format them as a numbered list, with titles. The style is factual and informative.'
    } else if (style === 'comedian') {
        return 'Summarize this forum discussion thread in 300-400 words. In the style of a stand-up comedian, tell a story around the 3 funniest quotes. Use active and very casual language.'
    } else if (style === 'tech-podcast') {
        return 'Summarize this forum discussion thread in 300-400 words. Start with a quick summary of the three most debated topics. Then dive into each topic in more detail. Use present tense, active language and a casual tone. Frame it as a dialog between "Host1" and "Host2" on a technology podcast.'
    } else {
        throw new Error(`Unrecognized style: ${style}`);
    }
}

function convertFlattenedStoryToPrompt(style, flattenedStory) {
    let text = `${getPrompt(style)}\n\n`;
    let textLen = text.length;
    for (let i = 0; i < flattenedStory.length; i++) {
        let commentEntryText = `Author: ${flattenedStory[i].by}\nComment: ${flattenedStory[i].text}`;
        if (textLen + commentEntryText.length > MAX_PROMPT_LEN) {
            break;
        }
        text += `\n${commentEntryText}`;
        textLen += commentEntryText.length;
    }
    return text;
}

function getVoiceParams(style) {
    if (style === 'bullet-points') {
        return {languageCode: 'en-US', name: 'en-US-Wavenet-D', ssmlGender: 'MALE'};
    } else if (style === 'comedian') {
        return {languageCode: 'en-IN', name: 'en-IN-Standard-B', ssmlGender: 'MALE'};
    } else if (style === 'tech-podcast') {
        return [{languageCode: 'en-US', name: 'en-US-Studio-M', ssmlGender: 'MALE'}, {languageCode: 'en-US', name: 'en-US-Studio-O', ssmlGender: 'FEMALE'}];
    } else {
        throw new Error(`Unrecognized style: ${style}`);
    }
}

function parseTechPodcastSummary(text) {
    let replacedText = text.replace(/Host1/g, 'Jason');
    replacedText = replacedText.replace(/Host2/g, 'Molly');

    const parsedSummary = [];
    const splits = replacedText.split('Jason:');
    for (let i = 0; i < splits.length; i++) {
        const subSplits = splits[i].split('Molly:');
        parsedSummary.push({speaker: 'Jason', content: subSplits[0]});
        for (let j = 1; j < subSplits.length; j++) {
            parsedSummary.push({speaker: 'Molly', content: subSplits[j]});
        }
    }
    return parsedSummary;
}

async function convertTextToSpeech(text, voice, outputPath) {
    const textToSpeechReq = {
        input: {text: text},
        voice: voice,
        audioConfig: {audioEncoding: 'MP3'},
    };

    const [response] = await textToSpeechClient.synthesizeSpeech(textToSpeechReq);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputPath, response.audioContent, 'binary');
    console.log(`Audio content written to file: ${outputPath}`);
}

async function convertSummaryToSpeech(summary, style) {
    if (style === 'tech-podcast') {
        const parsedSummary = parseTechPodcastSummary(summary);
        const voices = getVoiceParams(style);
        for (let i = 0; i < parsedSummary.length; i++) {
            let voice = (parsedSummary[i].speaker === 'Jason') ? voices[0] : voices[1];
            convertTextToSpeech(parsedSummary[i].content, voice, `output${i}.mp3`);
        }
    } else {
        convertTextToSpeech(summary, getVoiceParams(style), 'output.mp3');
    }
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
        const style = req.body.style;

        const story = await fetchHackerNewsItemsContents(storyId);
        const flattenedStory = flattenStory(story);

        const prompt = decode(convertFlattenedStoryToPrompt(style, flattenedStory));
        console.log(prompt);

        const completionResponse = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `${prompt}\n\n`,
            temperature: 0.5,
            max_tokens: MAX_OUT_TOKENS,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        const completionText = completionResponse.data.choices[0].text;

        await convertSummaryToSpeech(completionText, style);

        res.status(200).send({
            story: story,
            flattenedStory: flattenedStory,
            completion: completionText,
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({ error });
    }
})

app.listen(5001, () => { console.log('Server is running.') });