const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');


const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});


async function queryAI_GPT4_mini(requestContent) {
  let systemInput = [{
    role: 'system',
    content: `You are going to receive a logged request that was made by a Chrome browser while a user was browsing a website
        Your goal will be to look for requests where the email is part of the request and then additional user details come back in the 
        output. We are trying to identify API endpoints that are providing any details back based on the email or username. This also
        includes endpoints that do email_exists checks, get authorization info like tokens, return site specific data like the items
        in that users cart, or the posts by that user. There are too many types of user details to list here. The logged request is in
        the JSON format and the response is included as part of the JSON request you will be provided with. You should respond with a 
        response that I can parse as JSON and that includes the fields: "requestContainsEmail", "requestContainsUsername", "responseContainsUserDetails", 
        "availableFields", "isGraphQL", "name", "graphQLOperationName". The "availableFields" should be a csv list of userDetailFields on the response, it is just supposed to be a human readable
        text field that we can use to quickly see if there is useful information that request. "name" is just supposed to a few word label given to
        the endpoint. For example you might name the endpoint "user auth info" or "user token" or "user followers" or "user details". If the operation
        is a GraphQL operation try to extract the name of the query or mutation that is used and put this into the graphQLOperationName field, or leave
        that field blank. Do not include any
        extra characters or symbols in the response outside of the JSON response. You do not need to start the response with quotes.
        The resuld will be passed directly into JSON.parse() and it should not throw an error. Your response should look like: 
        {"requestContainsEmail": true, "isGraphQL": true, ...} `},
  { role: 'user', content: `This is the logged request. Please process it and return the JSON response as requested: ${requestContent}` }
  ]

  const chatCompletion = await openai.chat.completions.create({
    messages: systemInput,
    model: 'gpt-3.5-turbo',
  });
  console.log(chatCompletion.choices[0].message.content)

  let jsonString = chatCompletion.choices[0].message.content
  let jsonResponse = {}
  try {
    // Parse the JSON string
    jsonResponse = JSON.parse(jsonString);

  } catch (error) {
    console.error("Error parsing JSON:", jsonResponse);
  }

  return { gptData: chatCompletion.choices[0].message.content, jsonResponse }

}

const writeJSONToFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`JSON data has been written to ${filePath}`);
  } catch (error) {
    console.error(`Error writing JSON data to ${filePath}: ${error}`);
  }
};

// Function to generate a hash of a file
const generateFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
};

// Function to enumerate all files in subfolders
const enumerateFiles = async (topLevelFolder) => {
  const paths = [];
  let results = []
  // Recursively read directories
  const readDirRecursive = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        readDirRecursive(fullPath);
      } else {
        paths.push(fullPath);
      }
    });
  };

  // Start reading from the top-level folder
  readDirRecursive(topLevelFolder);

  // Print filenames and their hashes
  for (const filePath of paths) {
    if (!filePath.includes('.json') || !filePath.includes('response')) {
      continue
    }
    let pathResult = {}
    const hash = generateFileHash(filePath);
    console.log(`Filename: ${filePath}, Hash: ${hash}`);
    pathResult = { 'path': filePath, 'hash': hash }
    let jsonRequest = require('./' + filePath)
    let stringRequest = JSON.stringify(jsonRequest)
    // console.log(jsonRequest)
    // query GPT
    try {
      let gptResult = await queryAI_GPT4_mini(stringRequest)
  
        // console.log('returned result', gptResult)
      let existingFields = results.map(x => x.availableFields)
      let existingEndpointNames = results.map(x => x.name)
      pathResult = { ...pathResult, ...gptResult.jsonResponse }
      let isValid = gptResult?.jsonResponse?.requestContainsUsername ||  gptResult?.jsonResponse?.requestContainsEmail
      let isUseful = gptResult?.jsonResponse?.responseContainsUserDetails
      let isNotDuplicate = !existingFields.includes(gptResult?.jsonResponse?.availableFields)
      let isNotDuplicateName = !existingEndpointNames.includes(gptResult?.jsonResponse?.name)

      console.log('isUseful?', isUseful, 'isNotDuplicate?', isNotDuplicate)
      if (isValid && isUseful && isNotDuplicate && isNotDuplicateName) {
        results.push(pathResult)
        writeJSONToFile('./results.json', results)
      }
    } catch(e) {
      console.log('unable to process request', filePath)
    }
  };


};

(async () => {

  // Example usage
  const topLevelFolder = './data'; // Change this to the desired folder
  await enumerateFiles(topLevelFolder);

})();