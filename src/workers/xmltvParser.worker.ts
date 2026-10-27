import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

self.onmessage = (event: MessageEvent<{ id: number; xml: string }>) => {
  const { id, xml } = event.data;
  try {
    const tv = parser.parse(xml)?.tv;
    self.postMessage({ id, tv });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Could not parse XMLTV data.',
    });
  }
};

export {};
