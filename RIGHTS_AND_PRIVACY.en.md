# TryOn Compare: rights and privacy

Prepared 18 October 2026 for the YouCam API Skin AI & eCommerce VTO Hackathon. This note covers the demonstrated prototype and its submission materials. It does not certify final eligibility, public access or acceptance by the organizer.

## What was made

TryOn Compare is a new project created in October 2026 during the current submission period. It compares two or three clothing candidates using images, prices, wardrobe notes and Shortlist/Skip decisions. It is not a clothing retailer, a size recommendation service or an official Perfect Corp. product.

Two real YouCam Clothes V4 generations completed on 18 October 2026. Both 941 by 1672 pixel results decoded in the desktop browser. The measured balance changed from 40 to 36 units, a total of 4 units. The redesigned recorded-result demo displays these same results and does not claim that replay is a new API generation.

## Demonstration images and AI assistance

The person and both unbranded garment inputs were created for this project with OpenAI's built-in image_gen tool. The person was requested as a completely fictional adult, not a real customer or celebrity. No private portrait or retailer product photograph was used. The image tool did not expose its backend model name. The two try-on outputs are actual YouCam results, not stock illustrations or locally fabricated provider responses.

AI assistance was used to prepare code, documentation, test cases and the generated demonstration inputs. The project records separate evidence for real provider results, synthetic test responses and recorded-result playback. Generated content is not represented as a measured shopper outcome or as guaranteed unique intellectual property. OpenAI's applicable individual terms assign its output rights, if any and as law permits; they do not guarantee third-party clearance. [OpenAI terms](https://openai.com/policies/terms-of-use/).

The interface uses project-authored code and demonstration assets. Sunspel and Our Legacy pages were studied as layout references. Their photos, logos, code and proprietary font files were not copied into the app. Naming those references does not imply endorsement. The demonstration videos contain no third-party music or voice performance.

## Uploads, storage and credentials

In live mode, selected person and garment images are sent to YouCam only after the upload setting and the in-page consent are enabled. A person uploading real photos must have the necessary image rights and the depicted people's consent. Photos may carry embedded metadata; inspect it before uploading. Do not upload another person's sensitive or confidential material.

YouCam's September 2026 API terms generally provide 30-day retention for submitted data and generated content. Provider policies and settings control retention. Clearing this board does not delete provider files, and the app does not promise immediate or 24-hour deletion. The file-retention guide separately describes 30-day file/task availability and two-hour download URLs. [API terms, section 12.4](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api), [retention guide](https://docs.perfectcorp.com/develop/file_retention_period), [API privacy policy](https://www.perfectcorp.com/perfectbeauty/youcam/privacy-policy-api).

The same API terms say submitted content is not used to develop or improve the service without explicit agreement. This is the provider's stated policy, not a verified audit of its infrastructure. [API terms, section 11.2.1](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api).

Save stores comparison metadata in this browser's localStorage: product names, prices, notes, preferences, budget and decisions. It excludes photo bytes, generated image URLs, task IDs and credentials. Do not put personal information in free-text notes. The separately bundled fictional demo images remain files in the judging materials; clearing board metadata does not erase those files.

The provider key stays on the owner-controlled server. It must not be placed in browser code, a shared source archive, screenshots or a public repository. Judges should never receive the owner's key. The recorded-result build does not need a provider key or create provider tasks. Section 3.1 of the API terms prohibits disclosing or lending keys. [API terms](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api).

## Provider rights and result limits

Perfect's API terms do not claim ownership of AI-generated results and do not prohibit their commercial use. Inputs and outputs still need lawful rights and consent. This supports using the demonstrated results in the submission; it is not a guarantee against third-party claims. [API terms, sections 3.5.3, 8.4 and 11.3](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api).

The olive output changed the gray undershirt to white and rolled the sleeves. Exact garment reproduction, size, physical fit and fabric behavior have not been validated. The demo prices and decisions are examples. Returns, purchase satisfaction and time saved have not been measured.

## Code access and submission boundaries

On 18 October 2026 the owner approved public release of this project at https://github.com/hgyu-mech/tryon-compare and selected the MIT License for its original application code. The LICENSE file contains that grant. Existing third-party license notices are preserved; provider technology, retailer materials, dependencies and other third-party assets are not relicensed by this choice. Public release does not certify hackathon eligibility, unrestricted generation capacity or final submission.

The current rules allow either a public code repository with relevant licensing or a private repository shared with the organizer's specified judging address. That address was masked in the available official page and has not been verified; do not use the masked text as an email address. Keeping a private local source pack is preparation, not completed judge access. [Hackathon rules, section 4](https://youcam-api-skin-ai-ecommerce.devpost.com/rules).

The rules also require free, unrestricted project access through the judging period and a public 1-3 minute demo video. Live generation consumes finite provider units, so no unlimited-generation promise is made. A recorded-result build has a narrower function and must be labeled accordingly. Whether the eventual access arrangement satisfies the organizer remains to be confirmed. An installed local prototype or a saved MP4 alone does not complete those requirements. [Hackathon rules, Testing and Submission Requirements](https://youcam-api-skin-ai-ecommerce.devpost.com/rules).

For release, preserve private configuration and credential exclusions, asset origins, third-party notices and AI disclosures; independently verify judge access and current submission instructions. Age, residence and student-award eligibility require the entrant's own confirmation; none is inferred here. No application, public post, repository push or submission is performed by this document.

