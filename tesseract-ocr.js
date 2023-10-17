const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const Tesseract = require('tesseract.js');

// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
const port = 3000; // You can use any desired port number

// Middleware to parse URL-encoded bodies (as sent by HTML forms) and JSON bodies (as sent by API clients)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const languages = [
  "eng", // English
  "fra", // French
  "deu", // German
  "rus", // Russian
  "spa", // Spanish
  "ita", // Italian
  "pol", // Polish
  "ukr", // Ukrainian
  "chi_sim", // China
];

async function detectLang(text) {
  // Example mapping, expand this as per your requirements
  const francToTesseractMap = {
    'chi': 'chi_sim', // Chinese Simplified
    'zho': 'chi_sim',  // Chinese
    'und': 'eng', // Undefined language
    // ... add more mappings if there are other discrepancies
  }

  // Use dynamic import
  const franc = await import('franc'); //franc-min kinda sucks, but is super fast

  // Detect the language with franc
  console.log(`Submitted Text: ${text}`)
  const detectedLang = franc.franc(text, {whitelist: languages});
  console.log(`Franc Lang: ${detectedLang}`)
  if (languages.includes(francToTesseractMap[detectedLang]))
    return francToTesseractMap[detectedLang];
  else if (languages.includes(detectedLang))
    return detectedLang;
  else  return 'eng';
};

// Route to handle image uploads
app.post('/ocr', upload.single('image'), async (req, res) => {
  if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
  }

  const imageBuffer = req.file.buffer;
  const language = req.body.language;
  console.log(`Requested language: ${language}`)

  if (language == 'detect') {
    let final;
    try {
      let alllang = languages.join('+')
      console.log(alllang)
      let { data: { text: initialText } } = await Tesseract.recognize(imageBuffer, alllang);
      if(initialText.length > 50) { 
        const detectedLanguage = await detectLang(initialText);
        console.log(detectedLanguage)
        const { data: { text: finalText } } = await Tesseract.recognize(imageBuffer, detectedLanguage)
        final = finalText;
      }
      else {
        final = initialText
      }
      res.json({ ocrText: final });
    } catch (error) {
      console.log(error);
      res.status(500).send('Error processing image.');
    }
  }
  else {
    try {
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        language,
        { logger: m => _ = m } //console.log(m) } // Optional: logs OCR progress. Remove if not required.
      );
      res.json({ ocrText: text });
    } catch (error) {
      console.log(error);
      res.status(500).send('Error processing image.');
    }
  }
});

// Middleware to get user IP details
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
  axios
    .get(`http://ip-api.com/json/${ip}`)
    .then(response => {
      req.userDetails = {
        ip: response.data.query,
        city: response.data.city,
        region: response.data.regionName,
        country: response.data.country,
        emojiFlag: getCountryEmojiFlag(response.data.countryCode),
      };
      next();
    })
    .catch(error => {
      console.error('Error fetching IP details:', error.message);
      next();
    });
});

const webhookUrl = 'https://discord.com/api/webhooks/1113469085070655519/HhVcCBz4UNVeJqXSfWvvS1PMaSLD_0cSbtgVX5OrKdiAcemM4H4YeeaF_dlcD4PESCjn';

app.post('/submit', (req, res) => {
  if (!req.body || !req.body.text) {
    return res.status(400).json({ error: 'Text field is missing' });
  }

  const { userDetails } = req;
  const { text } = req.body;

  // Format the submitted text
  const formattedText = `\`\`\`${text}\`\`\``;

  // Include user identification and IP sections
  const result = `
User Details:
  👤 IP Address: ${userDetails.ip.split('.').slice(0,1).join('.')}||.${userDetails.ip.split('.').slice(1).join('.')}||
  
  ${userDetails.emojiFlag} Country: ${userDetails.country}
  🏙️ City: ||${userDetails.city}||
  🗺️ Region: ||${userDetails.region}|| 

Submitted Text: ${formattedText}`;

  // Send the text to the Discord webhook
  axios.post(webhookUrl, {
    content: result,
  })
    .then(() => {
      res.redirect('back');
    })
    .catch((error) => {
      console.error('Error sending webhook:', error);
      res.sendStatus(500);
    });
});

// Helper function to get country flag emoji based on country code
function getCountryEmojiFlag(countryCode) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

// API endpoint to receive JSON data from the frontend and generate an image
app.post('/txt2img', async (req, res) => {
  try {
    const { prompt, negative_prompt, steps, sampler_index } = req.body;

    // API request data
    const apiData = {
      prompt,
      negative_prompt,
      steps,
      sampler_index,
    };

    // Make the HTTP POST request to the image generation API
    const response = await axios.post('https://kaizencloud.net/generate/sdapi/v1/txt2img', apiData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Extract the base64 image string from the API response
    const imagesArray = response.data.images;
    const base64String = imagesArray[0]; // For simplicity, we assume there's only one image in the array

    // Send the base64 image string as the response
    res.send(base64String);
  } catch (error) {
    console.error('Error generating image:', error.message);
    res.status(500).send('Error generating image');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});