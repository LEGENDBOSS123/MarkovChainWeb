var formatter = new Intl.NumberFormat("en-US");

class MarkovChain {
    constructor(options) {
        this.chain = options?.chain ?? new Map();
        this.order = options?.order ?? 3;
        this.minOrder = options?.minOrder ?? 1;
        this.nextOrder = options?.nextOrder ?? 3;
        this.stepDown = options?.stepDown ?? 1;
        this.stopCharacters = options?.stopCharacters ?? [".", "!", "?", "  "];
    }

    *getNgrams(text, order, nextOrder) {
        for (let i = 0; i < text.length - order - nextOrder + 1; i += Math.max(1, Math.floor(nextOrder))) {
            yield [text.substring(i, i + order), text.substring(i + order, i + order + nextOrder)];
        }
    }


    train(textData, clean, order = this.order, nextOrder = this.nextOrder) {
        if (order <= this.minOrder - 1) {
            return;
        }
        var ngrams = this.getNgrams(textData, order, nextOrder);
        var i = 0;
        for (var ngram of ngrams) {
            i++;
            if (!this.chain.has(ngram[0])) {
                this.chain.set(ngram[0], {
                    count: 0,
                    next: {}
                });
            }

            var current = this.chain.get(ngram[0]);
            current.count++;
            if (!current.next[ngram[1]]) {
                current.next[ngram[1]] = 0;
            }
            current.next[ngram[1]]++;
            if (i % 1000000 == 0) {
                console.log(formatter.format(i) + " / " + formatter.format(textData.length - order - nextOrder + 1) + ", " + this.chain.size);
            }
            if (this.chain.size > 4_000_000) {
                console.log("Cleaning up...");
                // console.log("Size: " + JSON.stringify(this.toJSON()).length);
                this.cleanUp(clean);
            }
        }
        console.log("Cleaning up...");
        this.cleanUp(clean);
        return this.train(textData, clean, order - this.stepDown, nextOrder);
    }

    cleanUp(x = 1) {
        for (var i of this.chain) {
            var next = i[1].next;
            for (var next_phrases in next) {
                if (next[next_phrases] <= x) {
                    i[1].count -= next[next_phrases];
                    delete next[next_phrases];
                }
            }
        }
        for (var i of this.chain) {
            if (i[1].count <= x) {
                this.chain.delete(i[0]);
            }
        }
        if (global?.gc) {
            global.gc();
        }
    }

    predictNext(text, order = this.order) {
        if (order <= this.minOrder - this.stepDown) {
            return null;
        }
        var current = this.chain.get(text.substring(text.length - order, text.length));
        if (!current) {
            return this.predictNext(text, order - this.stepDown);
        }

        var next = current.next;
        var random = Math.floor(Math.random() * current.count);
        for (var key in next) {
            random -= next[key];
            if (random <= 0) {
                return key;
            }
        }
        return this.predictNext(text, order - this.stepDown);
    }

    predict(text, count) {
        var result = text;
        for (var i = 0; i < count; i++) {
            var prediction = this.predictNext(result);
            if (!prediction) {
                break;
            }
            result += this.predictNext(result);
        }
        return result.substring(text.length);
    }

    predictUntil(text, stopArray = this.stopCharacters, max = 500) {
        var result = text;
        while (result.length < max) {
            var prediction = this.predictNext(result);
            if (!prediction) {
                break;
            }
            var stop = false;
            for (var letter of prediction) {
                result += letter;
                stopArray.forEach(function (c) {
                    if (result.endsWith(c)) {
                        stop = true;
                    }
                })
                if (stop) {
                    break;
                }
            }
            if (stop) {
                break;
            }
        }
        return result.substring(text.length);
    }



    toJSON() {
        var json = {};
        json.order = this.order;
        json.nextOrder = this.nextOrder;
        json.minOrder = this.minOrder;
        json.chain = Array.from(this.chain);
        json.stopCharacters = this.stopCharacters;
        json.stepDown = this.stepDown ?? 1;
        return json;
    }

    static fromJSON(json) {
        return new MarkovChain({
            order: json.order,
            minOrder: json.minOrder,
            nextOrder: json.nextOrder,
            stopCharacters: json.stopCharacters,
            chain: new Map(json.chain),
            stepDown: json.stepDown
        });
    }

    saveToFile(filename) {
        var json = this.toJSON();
        var data = JSON.stringify(json);
        writeFileSync(filename, data);
    }

    static loadFromFile(filename) {
        var data = readFileSync(filename);
        var json = JSON.parse(data);
        return MarkovChain.fromJSON(json);
    }
}



async function getTextFromFile() {
    const input = document.createElement('input');
    input.type = 'file';

    const fileChosen = new Promise(function (resolve, reject) {
        input.onchange = function (event) {
            const file = event.target.files[0];
            if (file) {
                resolve(file);
            } else {
                reject('No file selected');
            }
        };
        input.click();
    });

    try {
        const file = await fileChosen;
        const reader = new FileReader();
        const fileRead = new Promise(function (resolve, reject) {
            reader.onload = function () {
                resolve(reader.result);
            }
            reader.onerror = function () {
                reject('Error reading file');
            }
            reader.readAsText(file);
        });
        return await fileRead;
    }
    catch (error) {
        throw error;
    }
}



const messageWindow = document.getElementById('message-window');
const inputForm = document.getElementById('input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const statusDisplay = document.getElementById('status');

let markovChain;
async function loadAndDecompressGzipJson(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Get the readable stream from the response body
        const compressedStream = response.body;

        // Create a decompression stream for gzip
        const decompressionStream = new DecompressionStream("gzip");

        // Pipe the compressed stream through the decompression stream
        const decompressedStream = compressedStream.pipeThrough(decompressionStream);

        // Read the decompressed stream as text
        const decompressedText = await new Response(decompressedStream).text();

        // Parse the decompressed text as JSON
        const jsonData = JSON.parse(decompressedText);

        return jsonData;

    } catch (error) {
        console.error("Failed to load and decompress GZIP JSON:", error);
        throw error; // Re-throw to handle in the calling function
    }
}

// Example usage in your loadModel function:
async function loadModel() {


    try {
        const modelData = await loadAndDecompressGzipJson('model.gz');
        markovChain = MarkovChain.fromJSON(modelData); // Assuming MarkovChain.fromJSON exists

        console.log("Markov Chain Model:", markovChain);
        return markovChain;

    } catch (error) {
        console.error("Error loading model:", error);
        return null;
    }
}

// Call loadModel when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadModel();
});

function addMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = text;
    messageWindow.appendChild(messageElement);
    messageWindow.scrollTop = messageWindow.scrollHeight;
}

inputForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const messageText = userInput.value.trim();

    if (messageText && markovChain) {
        addMessage(messageText, 'user');
        userInput.value = '';

        setTimeout(() => {
            var prediction = markovChain.predict(messageText.toLowerCase(), 300);
            if (prediction.includes("\n")) {
                prediction = prediction.slice(prediction.indexOf("\n") + 1);
            }
            prediction = prediction.slice(0, prediction.indexOf("\n"));
            addMessage(prediction, 'bot');
        });
    }
});


document.addEventListener('DOMContentLoaded', () => {
    loadModel().then(function (x) {
        markovChain = x;
        statusDisplay.textContent = 'Model loaded successfully!';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.placeholder = "Type your message...";
        addMessage("Hello! I'm a chatbot powered by a Markov Chain. I will autocomplete your text!", "bot");
    });
});