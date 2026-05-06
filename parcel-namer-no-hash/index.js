import { Namer } from '@parcel/plugin';
import path from 'path';

export default new Namer({
  name({ bundle }) {
    // Entry bundles (HTML files) have a direct main entry
    const entry = bundle.getMainEntry();
    if (entry) {
      const name = path.basename(entry.filePath, path.extname(entry.filePath));
      return `${name}.${bundle.type}`;
    }

    // Inline scripts/styles don't have a main entry — walk assets to find a source filename
    let sourceName = null;
    bundle.traverseAssets(asset => {
      if (!sourceName) {
        sourceName = path.basename(asset.filePath, path.extname(asset.filePath));
      }
    });

    if (sourceName) {
      return `${sourceName}.${bundle.type}`;
    }

    return null;
  }
});
